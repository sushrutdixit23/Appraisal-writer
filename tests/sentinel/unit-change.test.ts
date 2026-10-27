// Changing a project's reporting unit: the pure plan, then the route against the HTTP fake of Supabase.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/workspace/unit/route";
import { planUnitChange } from "../../app/sentinel/lib/unitChange";
import { FakeBackend, useBackend } from "./fake-backend";
import { st } from "./helpers";

// ---- the plan --------------------------------------------------------------------------------------------------
test("plan: crore to lakh multiplies every amount by 100 and leaves blanks blank", () => {
  const p = planUnitChange([st("w", { id: "s1", revenue_from_operations: 1234.5, profit_before_tax: 100, profit_after_tax: 80, total_assets: 500 })], "INR_CRORE", "INR_LAKH", "convert");
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.from, "INR_CRORE");
  assert.equal(p.to, "INR_LAKH");
  assert.equal(p.statementsChanged, 1);
  const r = p.rows[0];
  assert.equal(r.revenue_from_operations, 123450);
  assert.equal(r.profit_after_tax, 8000);
  assert.equal(r.total_assets, 50000);
  assert.equal(r.inventory, null);
  assert.equal(r.period_label, "FY26"); // everything that is not an amount is untouched
  assert.equal(p.lossy, false);
});

test("plan: lakh to crore divides by 100 with no float noise", () => {
  const p = planUnitChange([st("w", { id: "s1", revenue_from_operations: 123456, profit_before_tax: 10, profit_after_tax: 7 })], "INR_LAKH", "INR_CRORE", "convert");
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.rows[0].revenue_from_operations, 1234.56);
  assert.equal(p.rows[0].profit_after_tax, 0.07);
});

test("plan: million to lakh goes through crore (1 million = 0.1 crore = 10 lakh)", () => {
  const p = planUnitChange([st("w", { id: "s1", revenue_from_operations: 50, profit_before_tax: 5, profit_after_tax: 4 })], "INR_MILLION", "INR_LAKH", "convert");
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.rows[0].revenue_from_operations, 500);
});

test("plan: relabel changes nothing but the unit", () => {
  const p = planUnitChange([st("w", { id: "s1" })], "INR_CRORE", "lakhs", "relabel");
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.to, "INR_LAKH");
  assert.deepEqual(p.rows, []);
  assert.equal(p.statementsChanged, 0);
});

test("plan: refuses an unknown unit, an unknown mode and no change", () => {
  assert.equal(planUnitChange([], "INR_CRORE", "dollars", "convert").ok, false);
  assert.equal(planUnitChange([], "INR_CRORE", 5, "convert").ok, false);
  assert.equal(planUnitChange([], "INR_CRORE", "INR_LAKH", "shrug").ok, false);
  assert.equal(planUnitChange([], "INR_CRORE", "crore", "convert").ok, false);
});

test("plan: converting there and back restores the original figures", () => {
  const original = st("w", { id: "s1", revenue_from_operations: 1234.56, profit_before_tax: 99.99, profit_after_tax: 71.25, total_assets: 4321.1 });
  const there = planUnitChange([original], "INR_CRORE", "INR_LAKH", "convert");
  assert.ok(there.ok);
  if (!there.ok) return;
  const back = planUnitChange(there.rows, "INR_LAKH", "INR_CRORE", "convert");
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.rows[0].revenue_from_operations, 1234.56);
  assert.equal(back.rows[0].profit_before_tax, 99.99);
  assert.equal(back.rows[0].total_assets, 4321.1);
});

test("plan: crore to plain rupees is exact, and the reverse is flagged when digits would be lost", () => {
  const up = planUnitChange([st("w", { id: "s1", revenue_from_operations: 1.5, profit_before_tax: 1, profit_after_tax: 1 })], "INR_CRORE", "INR", "convert");
  assert.ok(up.ok);
  if (!up.ok) return;
  assert.equal(up.rows[0].revenue_from_operations, 15_000_000);
  assert.equal(up.lossy, false);

  const down = planUnitChange([st("w", { id: "s1", revenue_from_operations: 123456789012345, profit_before_tax: 1, profit_after_tax: 1 })], "INR", "INR_CRORE", "convert");
  assert.ok(down.ok);
  if (!down.ok) return;
  assert.equal(down.lossy, true);
});

// ---- the route -------------------------------------------------------------------------------------------------
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
    { ...st(wsA), id: randomUUID(), period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 900, profit_after_tax: 70 },
    { ...st(wsA), id: randomUUID() },
    { ...st(wsB), id: randomUUID() },
    { ...st(wsRef), id: randomUUID() },
  ];
  backend.tables.sentinel_investigations = [{ id: randomUUID(), workspace_id: wsA, ai_narrative: "Revenue rose to ₹1,000 cr.", final_narrative: null }];
});

async function call(body: unknown, token: string | null = "tok-a") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(new Request("http://localhost/api/sentinel/workspace/unit", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
}
const unitOf = (id: string) => backend.rowsOf("sentinel_workspaces").find((w) => w.id === id)!.currency_unit;
const revenues = (id: string) => backend.rowsOf("sentinel_statements").filter((s) => s.workspace_id === id).map((s) => s.revenue_from_operations).sort((x, y) => x - y);

test("route: converting crore to lakh rewrites every period and the unit, and counts narratives to regenerate", async () => {
  const r = await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "convert" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.statements_changed, 2);
  assert.equal(r.json.investigations_to_regenerate, 1);
  assert.equal(unitOf(wsA), "INR_LAKH");
  assert.deepEqual(revenues(wsA), [90000, 100000]);
  // Rows are replaced in place, not duplicated, and keep their other columns.
  assert.equal(backend.rowsOf("sentinel_statements").filter((s) => s.workspace_id === wsA).length, 2);
  assert.ok(backend.rowsOf("sentinel_statements").every((s) => s.source_file === "test"));
});

test("route: relabelling changes only the unit", async () => {
  const r = await call({ workspace_id: wsA, unit: "lakh", mode: "relabel" });
  assert.equal(r.status, 200);
  assert.equal(unitOf(wsA), "INR_LAKH");
  assert.deepEqual(revenues(wsA), [900, 1000]);
});

test("route: other companies are untouched", async () => {
  await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "convert" });
  assert.equal(unitOf(wsB), "INR_CRORE");
  assert.deepEqual(revenues(wsB), [1000]);
  assert.deepEqual(revenues(wsRef), [1000]);
});

test("route: a user cannot change someone else's company or a reference company", async () => {
  assert.equal((await call({ workspace_id: wsB, unit: "INR_LAKH", mode: "convert" })).status, 404);
  const ref = await call({ workspace_id: wsRef, unit: "INR_LAKH", mode: "convert" });
  assert.equal(ref.status, 403);
  assert.equal(unitOf(wsB), "INR_CRORE");
  assert.equal(unitOf(wsRef), "INR_CRORE");
  assert.deepEqual(revenues(wsRef), [1000]);
});

test("route: no token is refused, a bad unit or mode is a 400, and nothing changes", async () => {
  assert.equal((await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "convert" }, null)).status, 401);
  assert.equal((await call({ workspace_id: wsA, unit: "dollars", mode: "convert" })).status, 400);
  assert.equal((await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "double" })).status, 400);
  assert.equal((await call({ workspace_id: wsA, unit: "INR_CRORE", mode: "convert" })).status, 400);
  assert.equal(unitOf(wsA), "INR_CRORE");
  assert.deepEqual(revenues(wsA), [900, 1000]);
});

test("route: if the unit update fails after the figures were rewritten, the figures are put back", async () => {
  backend.failNext = { table: "sentinel_workspaces", method: "PATCH", status: 500, body: { message: "disk full" } };
  const r = await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "convert" });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /Nothing was changed/);
  assert.equal(unitOf(wsA), "INR_CRORE");
  assert.deepEqual(revenues(wsA), [900, 1000]);
});

test("route: if rewriting the figures fails, the unit is not touched", async () => {
  backend.failNext = { table: "sentinel_statements", method: "POST", status: 500, body: { message: "boom" } };
  const r = await call({ workspace_id: wsA, unit: "INR_LAKH", mode: "convert" });
  assert.equal(r.status, 500);
  assert.equal(unitOf(wsA), "INR_CRORE");
  assert.deepEqual(revenues(wsA), [900, 1000]);
});
