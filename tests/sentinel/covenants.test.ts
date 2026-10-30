// Covenant tracker: the ratio each covenant is tested on, the room left, and the cases where a number would look safe but is not.

import test from "node:test";
import assert from "node:assert/strict";
import { attentionLine, evaluateCovenant, rankResults, validateCovenant, type CovenantRow } from "../../app/sentinel/lib/covenants";
import { st, ws } from "./helpers";

const W = ws("a", { owner_id: "me", is_public_reference: false });
const cov = (over: Partial<CovenantRow> = {}): CovenantRow => ({ workspace_id: "a", name: "Term loan", metric: "net_debt_ebitda", comparator: "max", limit_value: 3, ...over });
const year = (over = {}) => st("a", { period_label: "FY26", period_end_date: "2026-03-31", total_debt: 500, cash_and_equivalents: 100, ebitda: 200, ...over });
const run = (c: CovenantRow, statements = [year()], today = "2026-10-28") => evaluateCovenant(c, statements, W, today);

test("net debt / EBITDA: (500 - 100) / 200 = 2.0x against a 3.0x cap leaves a third of the room, and EBITDA could fall a third", () => {
  const r = run(cov());
  assert.equal(r.status, "ok");
  assert.equal(r.value, 2);
  assert.ok(Math.abs((r.headroom ?? 0) - 1 / 3) < 1e-9);
  assert.ok(Math.abs((r.ebitda_cushion ?? 0) - 1 / 3) < 1e-9); // 1 - 400 / (3 * 200)
  assert.match(r.reason, /FY26 \(consolidated\): Net debt \/ EBITDA 2\.00x against at most 3\.00x - 33% of room/);
});

test("tight below 15% of room, breached above the limit, and exactly at the limit is within it", () => {
  assert.equal(run(cov({ limit_value: 2.2 })).status, "tight"); // 2.0 of 2.2: 9% room
  assert.equal(run(cov({ limit_value: 2 })).status, "tight"); // at the limit: no room, not breached
  const b = run(cov({ limit_value: 1.5 }));
  assert.equal(b.status, "breach");
  assert.ok(Math.abs((b.headroom ?? 0) - (-1 / 3)) < 1e-9); // (1.5 - 2) / 1.5
  assert.match(b.reason, /33% past the limit/);
});

test("a minimum covenant measures room against the ratio: interest cover 5.0x with a 2.5x floor has half to lose", () => {
  // EBIT = PBT 150 + finance costs 50 = 200; 200 / 50 = 4.0x. Floor 2.5x -> (4 - 2.5) / 4 = 37.5%.
  const r = run(cov({ metric: "interest_cover", comparator: "min", limit_value: 2.5 }), [year({ profit_before_tax: 150, finance_costs: 50 })]);
  assert.equal(r.value, 4);
  assert.equal(r.status, "ok");
  assert.ok(Math.abs((r.headroom ?? 0) - 0.375) < 1e-9);
  assert.equal(r.ebitda_cushion, null);
  assert.equal(run(cov({ metric: "interest_cover", comparator: "min", limit_value: 5 }), [year({ profit_before_tax: 150, finance_costs: 50 })]).status, "breach");
});

test("net cash is within any leverage cap and says so; a loss-making EBITDA under net debt is a breach, not a number that looks small", () => {
  const cash = run(cov(), [year({ total_debt: 50, cash_and_equivalents: 120 })]);
  assert.equal(cash.status, "ok");
  assert.ok((cash.value ?? 0) < 0);
  assert.match(cash.reason, /net cash/);
  const loss = run(cov(), [year({ ebitda: -20 })]);
  assert.equal(loss.status, "breach");
  assert.equal(loss.value, null);
  assert.match(loss.reason, /EBITDA is not positive/);
});

test("debt / equity and current ratio, and negative equity breaches a debt-to-equity cap", () => {
  assert.equal(run(cov({ metric: "debt_equity", limit_value: 1 }), [year({ total_debt: 400, total_equity: 800 })]).value, 0.5);
  assert.equal(run(cov({ metric: "debt_equity", limit_value: 1 }), [year({ total_equity: -50 })]).status, "breach");
  const cr = run(cov({ metric: "current_ratio", comparator: "min", limit_value: 1.2 }), [year({ current_assets: 600, current_liabilities: 400 })]);
  assert.equal(cr.value, 1.5);
  assert.equal(cr.status, "ok");
});

test("a missing input is 'cannot test' with the reason, never a guess; so is a company with no annual statement", () => {
  assert.equal(run(cov(), [year({ ebitda: null })]).status, "unknown");
  assert.match(run(cov(), [year({ ebitda: null })]).reason, /cannot be computed/);
  const none = run(cov(), []);
  assert.equal(none.status, "unknown");
  assert.match(none.reason, /No annual statement/);
  // quarterly statements are never used: they carry no balance sheet
  assert.equal(run(cov(), [year({ period_type: "Q2", period_label: "Q2 FY27" })]).status, "unknown");
});

test("the latest year is tested, on the company's own basis when it has that", () => {
  const r = run(cov(), [
    year({ period_label: "FY25", period_end_date: "2025-03-31", ebitda: 100 }),
    year({ period_label: "FY26", ebitda: 200 }),
    year({ period_label: "FY27", period_end_date: "2027-03-31", ebitda: 50, basis: "standalone" }),
  ]);
  assert.equal(r.period_label, "FY26"); // the company compares on consolidated; FY27 is standalone only
});

test("days to the next test, and the digest line appears for a tight, breached or soon-tested covenant but not a comfortable one", () => {
  assert.equal(run(cov({ next_test_date: "2026-11-10" })).days_to_test, 13);
  assert.equal(run(cov({ next_test_date: "2026-10-20" })).days_to_test, -8);
  assert.equal(attentionLine(run(cov())), null);
  assert.match(attentionLine(run(cov({ next_test_date: "2026-11-10" })))!, /Next test 2026-11-10 \(13 days\)/);
  assert.equal(attentionLine(run(cov({ next_test_date: "2027-03-31" }))), null);
  assert.match(attentionLine(run(cov({ limit_value: 2.2 })))!, /EBITDA can fall 9% before the limit is reached/);
  assert.match(attentionLine(run(cov({ limit_value: 1.5, next_test_date: "2026-10-20" })))!, /Test date 2026-10-20 has passed/);
});

test("ranking: breached first, then tight, then the nearest test", () => {
  const ranked = rankResults([run(cov({ name: "ok" })), run(cov({ name: "tight", limit_value: 2.2 })), run(cov({ name: "breach", limit_value: 1 }))]);
  assert.deepEqual(ranked.map((r) => r.covenant.name), ["breach", "tight", "ok"]);
});

test("validation: a name, a known ratio, a positive limit and a real date are required", () => {
  const good = { name: " Term loan ", metric: "interest_cover", limit_value: 2.5, next_test_date: "2026-12-31" };
  const v = validateCovenant(good);
  assert.ok(v.ok && v.row.name === "Term loan" && v.row.comparator === "min" && v.row.next_test_date === "2026-12-31");
  for (const bad of [{ ...good, name: "  " }, { ...good, metric: "pe" }, { ...good, limit_value: 0 }, { ...good, limit_value: "3" }, { ...good, next_test_date: "2026-02-30" }, { ...good, limit_value: 5000 }]) {
    assert.equal(validateCovenant(bad).ok, false, JSON.stringify(bad));
  }
  assert.ok(validateCovenant({ ...good, next_test_date: "" }).ok);
});
