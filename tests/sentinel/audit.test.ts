// Source and change history: the pure helpers, and the statement route recording them.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/statement/route";
import { classifySource, diffStatement, readSources } from "../../app/sentinel/lib/audit";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

// --- pure helpers ----------------------------------------------------------------------------

test("diffStatement reports only fields that changed; 100 and 100.0 are the same, null and missing are the same", () => {
  const before = { revenue_from_operations: 100, profit_after_tax: 10, other_income: null, extraction_notes: "a" };
  const after = { revenue_from_operations: 100.0, profit_after_tax: 12, extraction_notes: "b" };
  assert.deepEqual(diffStatement(before, after), {
    profit_after_tax: { old: 10, new: 12 },
    extraction_notes: { old: "a", new: "b" },
  });
  assert.deepEqual(diffStatement(before, before), {});
});

test("a figure going from a value to blank is a change, and so is a blank getting a value", () => {
  assert.deepEqual(diffStatement({ other_income: 5 }, { other_income: null }), { other_income: { old: 5, new: null } });
  assert.deepEqual(diffStatement({ other_income: null }, { other_income: 5 }), { other_income: { old: null, new: 5 } });
});

test("classifySource reads the forms' own wording and ignores everything else", () => {
  assert.equal(classifySource("Read from p.5 | Revenue from operations 1,000.00")?.kind, "rules");
  assert.equal(classifySource("Worked out: total income less other income. From p.5")?.kind, "derived");
  assert.equal(classifySource("Read by an AI model, not by rules - check it against the filing")?.kind, "ai");
  assert.equal(classifySource("typed by me"), null);
  assert.equal(classifySource("   "), null);
});

test("readSources keeps only known fields that were actually saved, and caps the detail", () => {
  const out = readSources(
    { revenue_from_operations: "Read from p.5 | x", not_a_field: "Read from p.1", other_income: "Read from p.5 | y", profit_after_tax: "Read from " + "z".repeat(900) },
    { revenue_from_operations: 100, profit_after_tax: 10, other_income: null }
  );
  assert.deepEqual(Object.keys(out).sort(), ["profit_after_tax", "revenue_from_operations"]);
  assert.equal(out.profit_after_tax.detail!.length, 500);
  assert.deepEqual(readSources(undefined, {}), {});
  assert.deepEqual(readSources("nope", {}), {});
});

// --- the route -------------------------------------------------------------------------------

const A = randomUUID();
const backend = new FakeBackend();
backend.unique = { ...backend.unique, sentinel_field_sources: ["statement_id", "field"] };
let wsA = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
});
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  backend.failNext = null;
  wsA = randomUUID();
  backend.tables.sentinel_workspaces = [
    { id: wsA, owner_id: A, company_name: "Alpha", is_public_reference: false, sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" },
  ];
});

const stmt = (over: Record<string, unknown> = {}) => ({
  period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated",
  revenue_from_operations: 1000, profit_before_tax: 100, profit_after_tax: 80, ...over,
});
async function save(body: Record<string, unknown>) {
  const res = await POST(new Request("http://x/api/sentinel/statement", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-a" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as any };
}

test("creating a period records who created it, and the figures' sources", async () => {
  const r = await save({ workspace_id: wsA, statement: stmt(), sources: { revenue_from_operations: "Read from p.5 | Revenue 1,000.00", profit_after_tax: "Read by an AI model, not by rules" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.history_recorded, true);
  const changes = backend.rowsOf("sentinel_statement_changes");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].action, "created");
  assert.equal(changes[0].changed_by, A);
  assert.equal(changes[0].via, "api");
  assert.equal(changes[0].statement_id, r.json.statement_id);
  const sources = backend.rowsOf("sentinel_field_sources");
  assert.deepEqual(sources.map((s) => [s.field, s.kind]).sort(), [["profit_after_tax", "ai"], ["revenue_from_operations", "rules"]]);
});

test("editing a period records exactly what changed, old and new, and a resave with no change records nothing", async () => {
  await save({ workspace_id: wsA, statement: stmt() });
  const edit = await save({ workspace_id: wsA, statement: stmt({ revenue_from_operations: 1100, profit_before_tax: 110, profit_after_tax: 88 }) });
  assert.equal(edit.json.status, "updated");
  const updates = backend.rowsOf("sentinel_statement_changes").filter((c) => c.action === "updated");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].changes, {
    revenue_from_operations: { old: 1000, new: 1100 },
    profit_before_tax: { old: 100, new: 110 },
    profit_after_tax: { old: 80, new: 88 },
  });
  const again = await save({ workspace_id: wsA, statement: stmt({ revenue_from_operations: 1100, profit_before_tax: 110, profit_after_tax: 88 }) });
  assert.equal(again.json.history_recorded, false);
  assert.equal(backend.rowsOf("sentinel_statement_changes").filter((c) => c.action === "updated").length, 1);
});

test("if the history tables are not there yet, the save still succeeds and says nothing was recorded", async () => {
  backend.failNext = { table: "sentinel_statement_changes", method: "POST", status: 404, body: { code: "PGRST205", message: "Could not find the table" } };
  const r = await save({ workspace_id: wsA, statement: stmt() });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "created");
  assert.equal(r.json.history_recorded, false);
  assert.equal(backend.rowsOf("sentinel_statements").length, 1);
});

test("a refused statement leaves no history behind", async () => {
  const r = await save({ workspace_id: wsA, statement: stmt({ profit_after_tax: "not a number" }) });
  assert.notEqual(r.status, 200);
  assert.equal(backend.rowsOf("sentinel_statement_changes").length, 0);
});
