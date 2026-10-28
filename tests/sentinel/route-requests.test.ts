// Data requests: who may open one, what the CA's public link can and cannot do, and that a submission lands as a draft.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../../app/api/sentinel/requests/route";
import { PATCH } from "../../app/api/sentinel/requests/[id]/route";
import { POST as SUBMIT } from "../../app/api/sentinel/submit/[token]/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { hashToken, isOverdue, nextPeriodEnd, defaultDueDate } from "../../app/sentinel/lib/requests";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
let ws = "", wsRef = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  backend.addUser("tok-b", B);
});
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  ws = randomUUID(); wsRef = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "standalone", currency_unit: "INR_CRORE" };
  backend.tables.sentinel_workspaces = [
    { id: ws, owner_id: A, company_name: "Acme Services", is_public_reference: false, ...base },
    { id: wsRef, owner_id: null, company_name: "Reference Co", is_public_reference: true, ...base },
  ];
});

const json = (token: string | null, method: string, body?: unknown, url = "http://localhost/api/sentinel/requests") =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

async function open(extra: Record<string, unknown> = {}, token: string | null = "tok-a", workspace = ws) {
  const res = await POST(json(token, "POST", { workspace_id: workspace, period_end_date: "2026-03-31", ...extra }));
  return { status: res.status, json: (await res.json()) as any };
}

const TB_CSV = [
  "Trial Balance", "Particulars,Debit,Credit",
  "Sales,,1000000", "Salaries,400000,", "Sundry Debtors,300000,", "Share Capital,,200000", "HDFC Bank,500000,", "Sundry Creditors,,600000",
].join("\n");

async function submit(token: string, file: File | null, size?: number) {
  const form = new FormData();
  if (file) form.append("file", file);
  void size;
  const res = await SUBMIT(new Request(`http://localhost/api/sentinel/submit/${token}`, { method: "POST", body: form }), { params: Promise.resolve({ token }) });
  return { status: res.status, json: (await res.json()) as any };
}
const csv = (text = TB_CSV) => new File([text], "tb.csv", { type: "text/csv" });

test("opening a request returns the link once and stores only a hash of its token", async () => {
  const r = await open({ cadence: "quarterly", note: "Q4 close" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(r.json.submit_path, `/submit/${r.json.token}`);
  const [row] = backend.rowsOf("sentinel_data_requests");
  assert.equal(row.token_hash, hashToken(r.json.token));
  assert.ok(!JSON.stringify(row).includes(r.json.token), "the plain token was stored");
  assert.equal(row.due_date, defaultDueDate("2026-03-31"));
});

test("only someone who can write to the company may open a request: strangers and reference companies are refused", async () => {
  assert.equal((await open({}, "tok-b")).status, 404);
  assert.equal((await open({}, "tok-a", wsRef)).status, 403);
  assert.equal((await open({}, null)).status, 401);
  assert.equal((await open({ period_end_date: "March" })).status, 400);
  assert.equal((await open({ cadence: "weekly" })).status, 400);
  assert.equal(backend.rowsOf("sentinel_data_requests").length, 0);
});

test("a CA's trial-balance upload becomes a draft for the right period, the request is marked submitted, and only a summary comes back", async () => {
  const { json: opened } = await open();
  const r = await submit(opened.token, csv());
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.periods, 1);
  assert.ok(!JSON.stringify(r.json).includes("1000000"), "figures were echoed to an unauthenticated caller");
  const [draft] = backend.rowsOf("sentinel_ingest_drafts");
  assert.equal(draft.status, "pending");
  assert.equal(draft.result.layout, "trial balance");
  assert.equal(draft.result.periods[0].period_label, "FY26");
  assert.equal(draft.result.periods[0].fields.revenue_from_operations.value, 1_000_000);
  assert.equal(backend.rowsOf("sentinel_data_requests")[0].status, "submitted");
  assert.equal(backend.rowsOf("sentinel_statements").length, 0, "a submission must never write a statement");
});

test("a malformed, unknown or closed token all get the same refusal", async () => {
  const { json: opened } = await open();
  const unknown = await submit("A".repeat(32), csv());
  const malformed = await submit("short", csv());
  backend.tables.sentinel_data_requests[0].status = "closed";
  const closed = await submit(opened.token, csv());
  for (const r of [unknown, malformed, closed]) {
    assert.equal(r.status, 404);
    assert.equal(r.json.error, "This upload link is not valid or has been closed.");
  }
  assert.equal(backend.rowsOf("sentinel_ingest_drafts").length, 0);
});

test("no file, an unreadable file and an oversized file are refused with a reason", async () => {
  const { json: opened } = await open();
  assert.equal((await submit(opened.token, null)).status, 400);
  assert.equal((await submit(opened.token, new File(["hello"], "notes.docx", { type: "application/msword" }))).status, 400);
  const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.csv", { type: "text/csv" });
  assert.equal((await submit(opened.token, big)).status, 413);
});

test("the upload link is rate limited per token", async () => {
  const { json: opened } = await open();
  for (let i = 0; i < 10; i++) await submit(opened.token, new File(["x"], "n.docx", { type: "application/msword" }));
  assert.equal((await submit(opened.token, csv())).status, 429);
});

test("listing shows the owner their requests and pending drafts, and nobody else's", async () => {
  const { json: opened } = await open();
  await submit(opened.token, csv());
  const mine = await (await GET(json("tok-a", "GET", undefined, `http://localhost/api/sentinel/requests?workspace_id=${ws}`))).json() as any;
  assert.equal(mine.requests.length, 1);
  assert.equal(mine.drafts.length, 1);
  assert.ok(!JSON.stringify(mine).includes("token_hash"));
  assert.equal((await GET(json("tok-b", "GET", undefined, `http://localhost/api/sentinel/requests?workspace_id=${ws}`))).status, 404);
});

test("an analyst can mark a draft imported, and close a request so its link stops working", async () => {
  const { json: opened } = await open();
  await submit(opened.token, csv());
  const reqId = backend.rowsOf("sentinel_data_requests")[0].id;
  const draftId = backend.rowsOf("sentinel_ingest_drafts")[0].id;
  const ctx = { params: Promise.resolve({ id: reqId }) };
  assert.equal((await PATCH(json("tok-b", "PATCH", { draft_id: draftId, status: "imported" }), ctx)).status, 404);
  assert.equal((await PATCH(json("tok-a", "PATCH", { draft_id: draftId, status: "imported" }), ctx)).status, 200);
  assert.equal(backend.rowsOf("sentinel_ingest_drafts")[0].status, "imported");
  assert.equal((await PATCH(json("tok-a", "PATCH", { status: "closed" }), ctx)).status, 200);
  assert.equal((await submit(opened.token, csv())).status, 404);
});

test("cadence arithmetic lands on month-ends, and a request is overdue only while open and past its due date", () => {
  assert.equal(nextPeriodEnd("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextPeriodEnd("2026-03-31", "quarterly"), "2026-06-30");
  assert.equal(nextPeriodEnd("2026-12-31", "quarterly"), "2027-03-31");
  assert.equal(nextPeriodEnd("2026-03-31", "annual"), "2027-03-31");
  assert.equal(isOverdue({ status: "open", due_date: "2026-04-10", period_end_date: "2026-03-31" }, "2026-04-11"), true);
  assert.equal(isOverdue({ status: "open", due_date: null, period_end_date: "2026-03-31" }, "2026-04-14"), false); // default is 15 days
  assert.equal(isOverdue({ status: "submitted", due_date: "2026-04-10", period_end_date: "2026-03-31" }, "2026-05-01"), false);
});
