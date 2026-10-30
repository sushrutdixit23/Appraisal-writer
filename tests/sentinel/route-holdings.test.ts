// /api/sentinel/holdings: holdings are private to the person who entered them, one row per person and company, importable from a broker file, and the refusals.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DELETE, GET, POST } from "../../app/api/sentinel/holdings/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID(), B = randomUUID();
const backend = new FakeBackend();
let mine = "", theirs = "", ref = "", mine2 = "";

before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); backend.addUser("tok-b", B); });
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  mine = randomUUID(); theirs = randomUUID(); ref = randomUUID(); mine2 = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    { id: mine, owner_id: A, company_name: "Alpha Limited", ticker: "ALPHA", bse_code: "500001", is_public_reference: false, ...base },
    { id: mine2, owner_id: A, company_name: "Beta Industries", ticker: null, bse_code: null, is_public_reference: false, ...base },
    { id: theirs, owner_id: B, company_name: "Theirs", ticker: "THEIRS", bse_code: "500002", is_public_reference: false, ...base },
    { id: ref, owner_id: null, company_name: "Reference Co", ticker: "REF", bse_code: "500003", is_public_reference: true, ...base },
  ];
});

const req = (token: string | null, method: string, body?: unknown, url = "http://localhost/api/sentinel/holdings") =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const save = async (token: string | null, body: Record<string, unknown>) => { const r = await POST(req(token, "POST", body)); return { status: r.status, json: (await r.json()) as any }; };
const list = async (token: string) => { const r = await GET(req(token, "GET")); return { status: r.status, json: (await r.json()) as any }; };

test("a holding is saved once per company and replaced, not duplicated, when saved again", async () => {
  assert.equal((await save("tok-a", { workspace_id: mine, quantity: 100, avg_cost: 250.5, notes: " core " })).status, 201);
  assert.equal((await save("tok-a", { workspace_id: mine, quantity: 150, avg_cost: null })).status, 200);
  const rows = (await list("tok-a")).json.holdings;
  assert.deepEqual(rows.map((h: any) => [h.workspace_id, h.quantity, h.avg_cost, h.notes]), [[mine, 150, null, null]]);
});

test("a reference company can be held; someone else's project cannot", async () => {
  assert.equal((await save("tok-a", { workspace_id: ref, quantity: 5 })).status, 201);
  assert.equal((await save("tok-a", { workspace_id: theirs, quantity: 5 })).status, 404);
  assert.equal((await list("tok-a")).json.holdings.length, 1);
});

test("holdings are private: another person lists none, and cannot delete mine", async () => {
  await save("tok-a", { workspace_id: mine, quantity: 10 });
  const id = (await list("tok-a")).json.holdings[0].id;
  assert.deepEqual((await list("tok-b")).json.holdings, []);
  const stolen = await DELETE(req("tok-b", "DELETE", undefined, `http://localhost/api/sentinel/holdings?id=${id}`));
  assert.equal(stolen.status, 404);
  assert.equal((await list("tok-a")).json.holdings.length, 1);
  assert.equal((await DELETE(req("tok-a", "DELETE", undefined, `http://localhost/api/sentinel/holdings?id=${id}`))).status, 200);
  assert.equal((await list("tok-a")).json.holdings.length, 0);
});

test("a bad quantity, a bad cost, no token and a bad body are refused", async () => {
  assert.equal((await save("tok-a", { workspace_id: mine, quantity: 0 })).status, 400);
  assert.equal((await save("tok-a", { workspace_id: mine, quantity: 5, avg_cost: -3 })).status, 400);
  assert.equal((await save(null, { workspace_id: mine, quantity: 5 })).status, 401);
  const bad = await POST(new Request("http://localhost/api/sentinel/holdings", { method: "POST", headers: { authorization: "Bearer tok-a" }, body: "{nope" }));
  assert.equal(bad.status, 400);
  assert.equal((await DELETE(req("tok-a", "DELETE", undefined, "http://localhost/api/sentinel/holdings?id=nope"))).status, 400);
});

test("a broker file is matched to the projects the caller can read, and the rest come back with reasons", async () => {
  const csv = ["Symbol,Quantity,Avg. cost", "ALPHA,10,100", "Beta Industries Ltd,20,", "REF,5,50", "THEIRS,9,9", "Nobody,3,3"].join("\n");
  const r = await save("tok-a", { csv });
  assert.equal(r.status, 200);
  assert.equal(r.json.saved, 3);
  assert.deepEqual(r.json.unmatched.map((u: any) => u.label).sort(), ["Nobody", "THEIRS"]);
  const rows = (await list("tok-a")).json.holdings;
  assert.deepEqual(rows.map((h: any) => [h.workspace_id, h.quantity, h.avg_cost]).sort(), [[mine, 10, 100], [mine2, 20, null], [ref, 5, 50]].sort());
});

test("importing again updates the same rows; 'replace' removes holdings the file no longer lists", async () => {
  await save("tok-a", { csv: "Symbol,Quantity\nALPHA,10\nREF,5" });
  const second = await save("tok-a", { csv: "Symbol,Quantity\nALPHA,12", replace: true });
  assert.equal(second.json.saved, 1);
  assert.equal(second.json.removed, 1);
  const rows = (await list("tok-a")).json.holdings;
  assert.deepEqual(rows.map((h: any) => [h.workspace_id, h.quantity]), [[mine, 12]]);
  // A file that matched nothing never wipes the book, even with replace.
  const none = await save("tok-a", { csv: "Symbol,Quantity\nNobody,1", replace: true });
  assert.equal(none.json.removed, 0);
  assert.equal((await list("tok-a")).json.holdings.length, 1);
});

test("a file with no quantity column is refused with the reason", async () => {
  const r = await save("tok-a", { csv: "Symbol,Price\nALPHA,10" });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /No quantity column/);
});

const MISSING = { table: "sentinel_holdings", status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.sentinel_holdings' in the schema cache" } };

test("before the migration is run, listing says not set up and saving says what to run", async () => {
  backend.failNext = { ...MISSING, method: "GET" };
  const l = await list("tok-a");
  assert.equal(l.status, 200);
  assert.deepEqual(l.json, { holdings: [], set_up: false });
  backend.failNext = { ...MISSING, method: "GET" };
  const s = await save("tok-a", { workspace_id: mine, quantity: 1 });
  assert.equal(s.status, 501);
  assert.match(s.json.error, /20261113000000/);
});
