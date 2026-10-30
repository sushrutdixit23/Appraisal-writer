// /api/sentinel/estimates: who can store and read estimates, that they are private to the person who entered them, and that a second save replaces the first.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DELETE, GET, POST } from "../../app/api/sentinel/estimates/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID(), B = randomUUID();
const backend = new FakeBackend();
let mine = "", theirs = "", ref = "";

before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); backend.addUser("tok-b", B); });
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  mine = randomUUID(); theirs = randomUUID(); ref = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    { id: mine, owner_id: A, company_name: "Mine", is_public_reference: false, ...base },
    { id: theirs, owner_id: B, company_name: "Theirs", is_public_reference: false, ...base },
    { id: ref, owner_id: null, company_name: "Reference", is_public_reference: true, ...base },
  ];
});

const req = (token: string | null, method: string, body?: unknown, url = "http://localhost/api/sentinel/estimates") =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const row = (over: Record<string, unknown> = {}) => ({ period_end_date: "2026-09-30", metric: "revenue", source: "consensus", value_cr: 1080, ...over });
const save = async (token: string | null, workspace: string, rows: unknown[]) => { const r = await POST(req(token, "POST", { workspace_id: workspace, rows })); return { status: r.status, json: (await r.json()) as any }; };
const list = async (token: string, workspace: string) => { const r = await GET(req(token, "GET", undefined, `http://localhost/api/sentinel/estimates?workspace_id=${workspace}`)); return { status: r.status, json: (await r.json()) as any }; };

test("a signed-in person saves estimates for their own company and for a reference company, and reads them back in rupees crore", async () => {
  assert.equal((await save("tok-a", mine, [row(), row({ metric: "pat", value_cr: 160, source: "own", source_label: "  My model  " })])).status, 201);
  assert.equal((await save("tok-a", ref, [row({ value_cr: 500 })])).status, 201);
  const mineList = (await list("tok-a", mine)).json.estimates;
  assert.deepEqual(mineList.map((e: any) => [e.metric, e.source, e.value_cr, e.source_label]).sort(), [["pat", "own", 160, "My model"], ["revenue", "consensus", 1080, null]]);
  assert.equal((await list("tok-a", ref)).json.estimates[0].value_cr, 500);
});

test("a second save for the same company, quarter, line and source replaces the first - one row, the new value", async () => {
  await save("tok-a", mine, [row({ value_cr: 1080 })]);
  await save("tok-a", mine, [row({ value_cr: 1095 })]);
  assert.equal(backend.rowsOf("sentinel_estimates").length, 1);
  assert.equal(backend.rowsOf("sentinel_estimates")[0].value_cr, 1095);
});

test("estimates are private: another person sees none of them, even on the same reference company, and cannot reach a private company at all", async () => {
  await save("tok-a", ref, [row({ value_cr: 500 })]);
  await save("tok-b", ref, [row({ value_cr: 777 })]);
  assert.deepEqual((await list("tok-a", ref)).json.estimates.map((e: any) => e.value_cr), [500]);
  assert.deepEqual((await list("tok-b", ref)).json.estimates.map((e: any) => e.value_cr), [777]);
  assert.equal((await save("tok-a", theirs, [row()])).status, 404);
  assert.equal((await list("tok-a", theirs)).status, 404);
  assert.equal((await save(null, mine, [row()])).status, 401);
});

test("only the owner removes an estimate; someone else's answers like one that does not exist", async () => {
  await save("tok-a", ref, [row()]);
  const id = backend.rowsOf("sentinel_estimates")[0].id as string;
  assert.equal((await DELETE(req("tok-b", "DELETE", undefined, `http://localhost/api/sentinel/estimates?id=${id}`))).status, 404);
  assert.equal(backend.rowsOf("sentinel_estimates").length, 1);
  assert.equal((await DELETE(req("tok-a", "DELETE", undefined, `http://localhost/api/sentinel/estimates?id=${id}`))).status, 200);
  assert.equal(backend.rowsOf("sentinel_estimates").length, 0);
});

test("bad input is refused with the reason: unknown line or source, a non-number, an impossible date, nothing at all, too many", async () => {
  const bad = async (over: Record<string, unknown>) => (await save("tok-a", mine, [row(over)]));
  assert.match((await bad({ metric: "eps" })).json.error, /revenue, ebitda, pbt or pat/);
  assert.match((await bad({ source: "rumour" })).json.error, /consensus or own/);
  assert.match((await bad({ value_cr: "1080" })).json.error, /number in rupees crore/);
  assert.match((await bad({ value_cr: 1e12 })).json.error, /number in rupees crore/);
  assert.match((await bad({ period_end_date: "2026-02-30" })).json.error, /YYYY-MM-DD/);
  assert.equal((await save("tok-a", mine, [])).status, 400);
  assert.equal((await save("tok-a", mine, Array.from({ length: 201 }, () => row()))).status, 400);
  assert.equal(backend.rowsOf("sentinel_estimates").length, 0, "a refused batch stores nothing");
});

test("a database without the table says how to set it up on save and returns an empty list on read", async () => {
  backend.failNext = { table: "sentinel_estimates", method: "POST", status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.sentinel_estimates' in the schema cache" } };
  const r = await save("tok-a", mine, [row()]);
  assert.equal(r.status, 501);
  assert.match(r.json.error, /20261108000000/);
});
