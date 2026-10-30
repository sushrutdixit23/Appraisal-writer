// /api/sentinel/export/docx: who can download a note, that it is built from the caller's own estimates only, and the refusals.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { POST } from "../../app/api/sentinel/export/docx/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";
import { st } from "./helpers";
import type { FinancialStatement } from "../../app/sentinel/lib/types";

const A = randomUUID(), B = randomUUID();
const backend = new FakeBackend();
let mine = "", theirs = "", ref = "", empty = "";

before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); backend.addUser("tok-b", B); });
after(() => backend.stop());

const quarter = (workspace: string, type: "Q1" | "Q2", label: string, end: string, over: Partial<FinancialStatement> = {}) => ({ id: randomUUID(), ...st(workspace, { period_type: type, period_label: label, period_end_date: end, ...over }) });

beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  mine = randomUUID(); theirs = randomUUID(); ref = randomUUID(); empty = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    { id: mine, owner_id: A, company_name: "Acme Systems", is_public_reference: false, ...base },
    { id: theirs, owner_id: B, company_name: "Theirs", is_public_reference: false, ...base },
    { id: ref, owner_id: null, company_name: "Reference Co", is_public_reference: true, ...base },
    { id: empty, owner_id: A, company_name: "No Quarters", is_public_reference: false, ...base },
  ];
  backend.tables.sentinel_statements = [
    quarter(mine, "Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: 1100, ebitda: 220, profit_before_tax: 200, profit_after_tax: 150 }),
    quarter(mine, "Q1", "Q1 FY27", "2026-06-30", { revenue_from_operations: 1050, ebitda: 215.25, profit_before_tax: 195, profit_after_tax: 146 }),
    quarter(theirs, "Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: 5, ebitda: 1, profit_before_tax: 1, profit_after_tax: 1 }),
    quarter(ref, "Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: 900, ebitda: 90, profit_before_tax: 80, profit_after_tax: 60 }),
  ];
});

const call = (token: string | null, body: unknown) => POST(new Request("http://localhost/api/sentinel/export/docx", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
const xmlOf = async (res: Response) => (await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()))).file("word/document.xml")!.async("string");

test("the owner downloads a Word file for the latest quarter, named for the company and quarter", async () => {
  const res = await call("tok-a", { workspace_id: mine });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /wordprocessingml\.document/);
  assert.match(res.headers.get("content-disposition") ?? "", /filename="Acme_Systems_Q2_FY27_earnings_note\.docx"/);
  const xml = await xmlOf(res);
  assert.ok(xml.includes("Acme Systems: Q2 FY27 results") && xml.includes("₹1,100 cr"));
});

test("a quarter can be chosen by its end date; one that is not on file is refused", async () => {
  const q1 = await call("tok-a", { workspace_id: mine, period_end_date: "2026-06-30" });
  assert.equal(q1.status, 200);
  assert.ok((await xmlOf(q1)).includes("Q1 FY27 results"));
  assert.equal((await call("tok-a", { workspace_id: mine, period_end_date: "2026-03-31" })).status, 404);
  assert.equal((await call("tok-a", { workspace_id: mine, period_end_date: "2026-02-30" })).status, 400);
});

test("estimates in the note are the caller's own for that quarter; another person's, and another quarter's, never appear", async () => {
  backend.tables.sentinel_estimates = [
    { id: randomUUID(), workspace_id: mine, owner_id: A, period_end_date: "2026-09-30", metric: "revenue", source: "consensus", source_label: "Street", value_cr: 1080 },
    { id: randomUUID(), workspace_id: mine, owner_id: B, period_end_date: "2026-09-30", metric: "revenue", source: "consensus", source_label: "Leak", value_cr: 7777 },
    { id: randomUUID(), workspace_id: mine, owner_id: A, period_end_date: "2026-06-30", metric: "revenue", source: "consensus", source_label: "Old", value_cr: 4444 },
  ];
  const xml = await xmlOf(await call("tok-a", { workspace_id: mine }));
  assert.ok(xml.includes("Against estimates") && xml.includes("Street") && xml.includes("₹1,080 cr"));
  assert.ok(!xml.includes("Leak") && !xml.includes("7,777") && !xml.includes("Old") && !xml.includes("4,444"));
});

test("without the estimates or transcripts tables the note is still written", async () => {
  backend.failNext = { table: "sentinel_estimates", method: "GET", status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.sentinel_estimates' in the schema cache" } };
  const res = await call("tok-a", { workspace_id: mine });
  assert.equal(res.status, 200);
  assert.ok(!(await xmlOf(res)).includes("Against estimates"));
});

test("access: a reference company's note is allowed, someone else's private company and a missing sign-in are not", async () => {
  assert.equal((await call("tok-a", { workspace_id: ref })).status, 200);
  assert.equal((await call("tok-a", { workspace_id: theirs })).status, 404);
  assert.equal((await call(null, { workspace_id: mine })).status, 401);
  assert.equal((await call("tok-a", { workspace_id: "not-a-uuid" })).status, 404);
});

test("a company with no quarterly results says so instead of producing an empty note", async () => {
  const res = await call("tok-a", { workspace_id: empty });
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /no quarterly results/);
});
