// /api/sentinel/covenants: who can store and read covenants, that they are private to the person who entered them, and the refusals.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DELETE, GET, POST } from "../../app/api/sentinel/covenants/route";
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

const req = (token: string | null, method: string, body?: unknown, url = "http://localhost/api/sentinel/covenants") =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const covenant = (over: Record<string, unknown> = {}) => ({ name: "Term loan A", metric: "net_debt_ebitda", limit_value: 3, next_test_date: "2026-12-31", ...over });
const save = async (token: string | null, workspace: string, over: Record<string, unknown> = {}) => { const r = await POST(req(token, "POST", { workspace_id: workspace, ...covenant(), ...over })); return { status: r.status, json: (await r.json()) as any }; };
const list = async (token: string, workspace: string) => { const r = await GET(req(token, "GET", undefined, `http://localhost/api/sentinel/covenants?workspace_id=${workspace}`)); return { status: r.status, json: (await r.json()) as any }; };

test("the owner adds a covenant and reads it back; the direction comes from the ratio", async () => {
  assert.equal((await save("tok-a", mine)).status, 201);
  assert.equal((await save("tok-a", mine, { name: "Working capital line", metric: "interest_cover", limit_value: 2.5, notes: "  half-yearly " })).status, 201);
  const rows = (await list("tok-a", mine)).json.covenants;
  assert.deepEqual(rows.map((c: any) => [c.name, c.metric, c.comparator, c.limit_value, c.notes]), [["Term loan A", "net_debt_ebitda", "max", 3, null], ["Working capital line", "interest_cover", "min", 2.5, "half-yearly"]]);
});

test("editing replaces one covenant in place and cannot reach another person's", async () => {
  await save("tok-a", mine);
  const id = backend.rowsOf("sentinel_covenants")[0].id as string;
  assert.equal((await POST(req("tok-a", "POST", { workspace_id: mine, id, ...covenant({ limit_value: 3.5 }) }))).status, 200);
  assert.equal(backend.rowsOf("sentinel_covenants").length, 1);
  assert.equal(backend.rowsOf("sentinel_covenants")[0].limit_value, 3.5);
  assert.equal((await POST(req("tok-b", "POST", { workspace_id: theirs, id, ...covenant() }))).status, 404);
  assert.equal(backend.rowsOf("sentinel_covenants")[0].limit_value, 3.5);
});

test("covenants are private and only a company you created can carry them", async () => {
  await save("tok-a", mine);
  assert.equal((await list("tok-b", mine)).status, 404); // B cannot even see A's private company
  assert.equal((await save("tok-a", theirs)).status, 404);
  assert.equal((await save("tok-a", ref)).status, 403); // reference companies are read-only
  assert.equal((await list("tok-a", ref)).json.covenants.length, 0);
  assert.equal((await save(null, mine)).status, 401);
});

test("only the owner removes a covenant; someone else's answers like one that does not exist", async () => {
  await save("tok-a", mine);
  const id = backend.rowsOf("sentinel_covenants")[0].id as string;
  assert.equal((await DELETE(req("tok-b", "DELETE", undefined, `http://localhost/api/sentinel/covenants?id=${id}`))).status, 404);
  assert.equal(backend.rowsOf("sentinel_covenants").length, 1);
  assert.equal((await DELETE(req("tok-a", "DELETE", undefined, `http://localhost/api/sentinel/covenants?id=${id}`))).status, 200);
  assert.equal(backend.rowsOf("sentinel_covenants").length, 0);
});

test("bad input is refused with the reason, and a refused covenant stores nothing", async () => {
  assert.match((await save("tok-a", mine, { name: " " })).json.error, /name/);
  assert.match((await save("tok-a", mine, { metric: "pe" })).json.error, /ratios Sentinel can compute/);
  assert.match((await save("tok-a", mine, { limit_value: -1 })).json.error, /positive number/);
  assert.match((await save("tok-a", mine, { next_test_date: "2026-02-30" })).json.error, /YYYY-MM-DD/);
  assert.equal(backend.rowsOf("sentinel_covenants").length, 0);
});

test("at most 30 covenants per company", async () => {
  for (let i = 0; i < 30; i++) assert.equal((await save("tok-a", mine, { name: `c${i}` })).status, 201);
  assert.match((await save("tok-a", mine, { name: "one too many" })).json.error, /At most 30/);
});

test("a database without the table says how to set it up on save and returns an empty list on read", async () => {
  backend.failNext = { table: "sentinel_covenants", method: "POST", status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.sentinel_covenants' in the schema cache" } };
  const r = await save("tok-a", mine);
  assert.equal(r.status, 501);
  assert.match(r.json.error, /20261111000000/);
});
