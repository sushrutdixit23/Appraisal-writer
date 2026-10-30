// /api/sentinel/annual-report against a FAKE BSE (global fetch is intercepted for bseindia.com hosts only; Supabase calls reach the fake backend as usual).
// This proves the route's access rules and what it returns; it does not prove that bseindia.com answers a cloud server.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/annual-report/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";
import { ANNUAL_REPORT_PAGES, makePdf } from "./pdf-fixtures";

const A = randomUUID(), B = randomUUID();
const backend = new FakeBackend();
const realFetch = globalThis.fetch;
let mine = "", noCode = "", theirs = "", ref = "";
let pdf: Buffer;
let bseCalls: string[] = [];
let bse: (u: URL) => Response = () => new Response("down", { status: 503 });

before(async () => {
  await backend.start(); useBackend(backend);
  backend.addUser("tok-a", A); backend.addUser("tok-b", B);
  pdf = await makePdf(ANNUAL_REPORT_PAGES);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (u.hostname.endsWith("bseindia.com")) { bseCalls.push(u.toString()); return bse(u); }
    return realFetch(input, init);
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; return backend.stop(); });
beforeEach(() => {
  resetRateLimits(); bseCalls = [];
  backend.tables = {};
  mine = randomUUID(); noCode = randomUUID(); theirs = randomUUID(); ref = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated", is_public_reference: false };
  backend.tables.sentinel_workspaces = [
    { id: mine, owner_id: A, company_name: "Mine", bse_code: "500325", ...base },
    { id: noCode, owner_id: A, company_name: "No code", bse_code: null, ...base },
    { id: theirs, owner_id: B, company_name: "Theirs", bse_code: "500325", ...base },
    { id: ref, owner_id: null, company_name: "Reference", bse_code: "500325", ...base, is_public_reference: true },
  ];
  bse = (u) => u.hostname === "api.bseindia.com"
    ? new Response(JSON.stringify({ Table: [{ NEWSID: "n1", NEWSSUB: "Annual Report for FY 2025-26", HEADLINE: "Annual Report", DT_TM: "2026-08-05T10:00:00", ATTACHMENTNAME: "ar2026.pdf", NSURL: "https://www.bseindia.com/x" }] }), { status: 200 })
    : u.pathname.includes("AttachLive") ? new Response(new Uint8Array(pdf), { status: 200 }) : new Response("no", { status: 404 });
});

const call = async (token: string | null, body: unknown) => {
  const r = await POST(new Request("http://localhost/api/sentinel/annual-report", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, json: (await r.json()) as any };
};

test("the owner fetches the latest annual report: found in the feed, downloaded, read like an upload, and nothing is saved", async () => {
  const r = await call("tok-a", { workspace_id: mine });
  assert.equal(r.status, 200);
  assert.equal(r.json.name, "ar2026.pdf");
  assert.match(r.json.source.headline, /Annual Report for FY 2025-26/);
  assert.equal(r.json.source.url, "https://www.bseindia.com/xml-data/corpfiling/AttachLive/ar2026.pdf");
  assert.ok(Array.isArray(r.json.result.periods) && r.json.result.periods.length > 0);
  assert.equal(backend.rowsOf("sentinel_statements").length, 0);
  assert.ok(bseCalls.every((u) => new URL(u).hostname.endsWith("bseindia.com")));
});

test("a pasted address is fetched only when it is on bseindia.com", async () => {
  const ok = await call("tok-a", { workspace_id: noCode, url: "https://www.bseindia.com/xml-data/corpfiling/AttachLive/ar2026.pdf" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.name, "ar2026.pdf");
  bseCalls = [];
  for (const url of ["https://evil.example/x.pdf", "http://www.bseindia.com/a.pdf", "https://bseindia.com.evil.example/a.pdf", "http://169.254.169.254/latest/meta-data"]) {
    const r = await call("tok-a", { workspace_id: noCode, url });
    assert.equal(r.status, 400, url);
  }
  assert.deepEqual(bseCalls, []);
});

test("a company with no BSE code and no address is told what to do; someone else's company and a reference company are refused", async () => {
  const none = await call("tok-a", { workspace_id: noCode });
  assert.equal(none.status, 400);
  assert.match(none.json.error, /no BSE scrip code.*paste the PDF's address/);
  assert.equal((await call("tok-a", { workspace_id: theirs })).status, 404);
  assert.equal((await call("tok-a", { workspace_id: ref })).status, 403);
  assert.equal((await call(null, { workspace_id: mine })).status, 401);
  assert.deepEqual(bseCalls, []);
});

test("when BSE refuses, the person is told which step failed (502), not given a blank error", async () => {
  bse = () => new Response("denied", { status: 403 });
  const r = await call("tok-a", { workspace_id: mine });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /BSE answered 403 to the announcements request/);
  bse = (u) => (u.hostname === "api.bseindia.com" ? new Response(JSON.stringify({ Table: [{ NEWSID: "n1", NEWSSUB: "Annual Report FY26", DT_TM: "2026-08-05T10:00:00", ATTACHMENTNAME: "ar.pdf" }] }), { status: 200 }) : new Response("<html>captcha</html>", { status: 200 }));
  const html = await call("tok-a", { workspace_id: mine });
  assert.equal(html.status, 502);
  assert.match(html.json.error, /not a PDF/);
});

test("it is rate limited: six fetches in ten minutes, then a refusal", async () => {
  for (let i = 0; i < 6; i++) assert.equal((await call("tok-a", { workspace_id: mine })).status, 200);
  assert.equal((await call("tok-a", { workspace_id: mine })).status, 429);
});
