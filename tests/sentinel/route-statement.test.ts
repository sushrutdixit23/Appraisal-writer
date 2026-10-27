// /api/sentinel/statement against a real HTTP fake of Supabase. The route uses the service key, so
// what is under test is the access and validation the route enforces itself.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/statement/route";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
let wsA = "", wsB = "", wsRef = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  backend.addUser("tok-b", B);
});
after(() => backend.stop());

beforeEach(() => {
  backend.tables = {};
  backend.failNext = null;
  wsA = randomUUID(); wsB = randomUUID(); wsRef = randomUUID();
  const base = { sector: "tyre", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    { id: wsA, owner_id: A, company_name: "Alpha", is_public_reference: false, ...base },
    { id: wsB, owner_id: B, company_name: "Bravo", is_public_reference: false, ...base },
    { id: wsRef, owner_id: null, company_name: "Reference Co", is_public_reference: true, ...base },
  ];
  backend.tables.sentinel_statements = [
    { id: randomUUID(), workspace_id: wsB, period_type: "FY", period_label: "FY25", period_end_date: "2025-03-31", basis: "consolidated", revenue_from_operations: 500, profit_before_tax: 50, profit_after_tax: 40 },
  ];
});

const stmt = (over: Record<string, unknown> = {}) => ({
  period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated",
  revenue_from_operations: 1000, profit_before_tax: 100, profit_after_tax: 80, ...over,
});

async function call(body: unknown, token: string | null = "tok-a", raw?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(new Request("http://localhost/api/sentinel/statement", { method: "POST", headers, body: raw ?? JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
}
const statements = (ws: string) => backend.rowsOf("sentinel_statements").filter((s) => s.workspace_id === ws);

// --- who is calling ---------------------------------------------------------------------------

test("no token, a malformed header and an unknown token are all refused", async () => {
  assert.equal((await call({ workspace_id: wsA, statement: stmt() }, null)).status, 401);
  assert.equal((await call({ workspace_id: wsA, statement: stmt() }, "nope")).status, 401);
  const res = await POST(new Request("http://x", { method: "POST", headers: { authorization: "tok-a" }, body: "{}" }));
  assert.equal(res.status, 401);
  assert.equal(statements(wsA).length, 0);
});

// --- which company ---------------------------------------------------------------------------

test("the owner can add a period to their own company", async () => {
  const r = await call({ workspace_id: wsA, statement: stmt() });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "created");
  assert.equal(statements(wsA).length, 1);
});

test("a user cannot write into someone else's company - it answers as if it does not exist", async () => {
  const before = backend.rowsOf("sentinel_statements").length;
  const r = await call({ workspace_id: wsB, statement: stmt() }, "tok-a");
  assert.equal(r.status, 404);
  assert.equal(backend.rowsOf("sentinel_statements").length, before);
});

test("a public reference company is read-only for everyone", async () => {
  const r = await call({ workspace_id: wsRef, statement: stmt() }, "tok-a");
  assert.equal(r.status, 403);
  assert.match(r.json.error, /read-only reference company/);
  assert.equal(statements(wsRef).length, 0);
});

test("a malformed or unknown workspace id is a plain 404", async () => {
  assert.equal((await call({ workspace_id: "not-a-uuid", statement: stmt() })).status, 404);
  assert.equal((await call({ workspace_id: randomUUID(), statement: stmt() })).status, 404);
  assert.equal((await call({ workspace_id: "' or 1=1 --", statement: stmt() })).status, 404);
});

test("extra columns cannot hijack a row: an injected id or workspace_id is ignored", async () => {
  const victim = backend.rowsOf("sentinel_statements")[0];
  const r = await call({ workspace_id: wsA, statement: stmt({ id: victim.id, workspace_id: wsB, review_cycle_id: randomUUID() }) });
  assert.equal(r.status, 200);
  assert.equal(statements(wsB).length, 1, "the other company's statement is untouched");
  assert.equal(statements(wsB)[0].revenue_from_operations, 500);
  const mine = statements(wsA);
  assert.equal(mine.length, 1);
  assert.notEqual(mine[0].id, victim.id);
  assert.equal(mine[0].review_cycle_id, undefined);
});

// --- creating a company -------------------------------------------------------------------------

test("a new company is created for the caller, in the unit they named", async () => {
  const r = await call({ company_name: "  Newco Ltd ", sector: "fmcg", currency_unit: "lakh", comparison_basis: "standalone", statement: stmt({ basis: "standalone" }) });
  assert.equal(r.status, 200);
  const ws = backend.rowsOf("sentinel_workspaces").find((w) => w.id === r.json.workspace_id)!;
  assert.equal(ws.owner_id, A);
  assert.equal(ws.company_name, "Newco Ltd");
  assert.equal(ws.is_public_reference, false);
  assert.equal(ws.currency_unit, "INR_LAKH");
  assert.equal(ws.comparison_basis, "standalone");
});

test("a statement that fails validation does not leave an empty company behind", async () => {
  const before = backend.rowsOf("sentinel_workspaces").length;
  const r = await call({ company_name: "Ghost Ltd", sector: "tyre", statement: stmt({ total_assets: 600, total_liabilities: 350, total_equity: 200 }) });
  assert.equal(r.status, 422);
  assert.equal(backend.rowsOf("sentinel_workspaces").length, before);
});

test("if saving the first statement fails after the company was created, the company is removed again", async () => {
  const before = backend.rowsOf("sentinel_workspaces").length;
  backend.failNext = { table: "sentinel_statements", method: "POST", status: 500, body: { message: "disk full" } };
  const r = await call({ company_name: "Half Ltd", sector: "tyre", statement: stmt() });
  assert.equal(r.status, 500);
  assert.equal(backend.rowsOf("sentinel_workspaces").length, before);
});

test("new-company details are checked: sector, unit, basis, fiscal month, name", async () => {
  assert.equal((await call({ company_name: "X", sector: "unknown-sector", statement: stmt() })).status, 400);
  assert.equal((await call({ company_name: "X", sector: "tyre", currency_unit: "dollars", statement: stmt() })).status, 400);
  assert.equal((await call({ company_name: "X", sector: "tyre", comparison_basis: "group", statement: stmt() })).status, 400);
  assert.equal((await call({ company_name: "X", sector: "tyre", fiscal_year_start_month: 13, statement: stmt() })).status, 400);
  assert.equal((await call({ company_name: "", sector: "tyre", statement: stmt() })).status, 400);
  assert.equal((await call({ company_name: "x".repeat(121), sector: "tyre", statement: stmt() })).status, 400);
  assert.equal(backend.rowsOf("sentinel_workspaces").length, 3, "nothing was created by any of those");
});

// --- the statement itself -------------------------------------------------------------------------

test("the same label and basis updates the row in place", async () => {
  const first = await call({ workspace_id: wsA, statement: stmt() });
  const second = await call({ workspace_id: wsA, statement: stmt({ revenue_from_operations: 1100, profit_before_tax: 110, profit_after_tax: 90 }) });
  assert.equal(second.json.status, "updated");
  assert.equal(second.json.statement_id, first.json.statement_id);
  assert.equal(statements(wsA).length, 1);
  assert.equal(statements(wsA)[0].revenue_from_operations, 1100);
});

test("the same label under the other basis is a separate statement, and updating one never touches the other", async () => {
  await call({ workspace_id: wsA, statement: stmt({ basis: "consolidated", revenue_from_operations: 1000 }) });
  const sa = await call({ workspace_id: wsA, statement: stmt({ basis: "standalone", revenue_from_operations: 700, profit_before_tax: 70, profit_after_tax: 50 }) });
  assert.equal(sa.json.status, "created");
  await call({ workspace_id: wsA, statement: stmt({ basis: "standalone", revenue_from_operations: 720, profit_before_tax: 72, profit_after_tax: 52 }) });
  const rows = statements(wsA);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.basis === "consolidated")!.revenue_from_operations, 1000);
  assert.equal(rows.find((r) => r.basis === "standalone")!.revenue_from_operations, 720);
});

test("the same label with a different period type is refused, not silently re-typed", async () => {
  await call({ workspace_id: wsA, statement: stmt({ period_type: "FY", period_label: "FY26" }) });
  const r = await call({ workspace_id: wsA, statement: stmt({ period_type: "Q4", period_label: "FY26" }) });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /already exists as FY/);
});

test("hard accounting errors refuse the save and write nothing", async () => {
  const r = await call({ workspace_id: wsA, statement: stmt({ total_assets: 600, total_liabilities: 350, total_equity: 200, inventory: -5 }) });
  assert.equal(r.status, 422);
  assert.equal(r.json.details.length, 2);
  assert.equal(statements(wsA).length, 0);
});

test("a warning is returned beside a successful save (negative equity is allowed)", async () => {
  const r = await call({ workspace_id: wsA, statement: stmt({ total_equity: -40 }) });
  assert.equal(r.status, 200);
  assert.match(r.json.warnings.join(" "), /Total equity is negative/);
  assert.equal(statements(wsA)[0].total_equity, -40);
});

test("malformed input is a clear 400: bad JSON, no statement, text where a number belongs", async () => {
  assert.equal((await call(null, "tok-a", "{not json")).status, 400);
  assert.equal((await call({ workspace_id: wsA })).status, 400);
  const r = await call({ workspace_id: wsA, statement: stmt({ profit_after_tax: "n/a" }) });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /profit_after_tax must be a number/);
  assert.equal(statements(wsA).length, 0);
});

test("figures pasted with thousands separators are stored as numbers", async () => {
  const r = await call({ workspace_id: wsA, statement: stmt({ revenue_from_operations: "12,34,567.5", profit_before_tax: "(100)", profit_after_tax: "-90" }) });
  assert.equal(r.status, 200);
  const row = statements(wsA)[0];
  assert.equal(row.revenue_from_operations, 1234567.5);
  assert.equal(row.profit_before_tax, -100);
  assert.equal(row.profit_after_tax, -90);
});

test("the unit check compares against this company's own earlier statements only", async () => {
  await call({ workspace_id: wsA, statement: stmt({ period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 10, profit_before_tax: 1, profit_after_tax: 1 }) });
  const r = await call({ workspace_id: wsA, statement: stmt({ revenue_from_operations: 1000 }) });
  assert.equal(r.status, 200);
  assert.match(r.json.warnings.join(" "), /100\.0x higher than FY25/);
  // Bravo's FY25 (revenue 500) is never consulted for Alpha.
  assert.ok(!r.json.warnings.join(" ").includes("500"));
});

// --- optional columns added later (retained earnings, COGS, SG&A) ---------------------------------

test("a save with none of the later-added lines never sends those columns, so it works before the migration", async () => {
  const r = await call({ workspace_id: wsA, statement: stmt() });
  assert.equal(r.status, 200);
  const saved = statements(wsA)[0];
  for (const key of ["retained_earnings", "cost_of_goods_sold", "sga_expense"]) assert.equal(key in saved, false, key);
});

test("when one of them is filled it is saved, and clearing it later saves a null because the column now exists", async () => {
  const first = await call({ workspace_id: wsA, statement: stmt({ retained_earnings: 600 }) });
  assert.equal(first.status, 200);
  assert.equal(statements(wsA)[0].retained_earnings, 600);
  const cleared = await call({ workspace_id: wsA, statement: stmt() });
  assert.equal(cleared.json.status, "updated");
  assert.equal(statements(wsA)[0].retained_earnings, null);
});
