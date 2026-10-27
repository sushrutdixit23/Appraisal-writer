// Business-health bands and the benchmark engine, against hand-computed cases.

import test from "node:test";
import assert from "node:assert/strict";
import { computeHealthScore, type HealthCategory } from "../../app/sentinel/lib/health";
import { findClosestPeer, getBenchmark } from "../../app/sentinel/lib/benchmark";
import type { PeerRow } from "../../app/sentinel/lib/types";
import { near, st } from "./helpers";

const cat = (score: ReturnType<typeof computeHealthScore>, key: string): HealthCategory =>
  score.categories.find((c) => c.key === key)!;

// Tyre thresholds: current_ratio_min 1.0, debt_equity_max 2.0, inventory_days_max 60,
// receivable_days_max 60, yoy_swing_pct 15. Bands on severity (value vs line): <=0.7 healthy,
// <=1.0 watch, <=1.4 concern, above that critical.

test("profitability: no change in margin is healthy; a 2pp fall is exactly 'watch'; 2.8pp concern; 3pp critical", () => {
  const prior = st("a", { revenue_from_operations: 1000, profit_after_tax: 100 }); // 10.0%
  const status = (pat: number) =>
    cat(computeHealthScore(st("a", { revenue_from_operations: 1000, profit_after_tax: pat }), prior, "tyre"), "profitability").status;
  assert.equal(status(100), "healthy"); // 0pp
  assert.equal(status(120), "healthy"); // +2pp
  assert.equal(status(80), "watch"); // -2pp -> severity 1.0
  assert.equal(status(72), "concern"); // -2.8pp -> severity 1.4
  assert.equal(status(70), "critical"); // -3pp -> severity 1.5
});

test("profitability: a loss is never better than 'concern' even when the loss is shrinking", () => {
  const prior = st("a", { revenue_from_operations: 1000, profit_after_tax: -200 });
  const now = st("a", { revenue_from_operations: 1000, profit_after_tax: -100 });
  assert.equal(cat(computeHealthScore(now, prior, "tyre"), "profitability").status, "concern");
});

test("profitability with no prior year: sign of the margin decides", () => {
  const s = (pat: number) => cat(computeHealthScore(st("a", { profit_after_tax: pat }), null, "tyre"), "profitability").status;
  assert.equal(s(10), "healthy");
  assert.equal(s(0), "concern");
  assert.equal(s(-10), "critical");
});

test("liquidity bands: 1.5x healthy, 1.0x watch, 0.8x concern, 0.6x critical", () => {
  const s = (ca: number) =>
    cat(computeHealthScore(st("a", { current_assets: ca, current_liabilities: 100 }), null, "tyre"), "liquidity").status;
  assert.equal(s(150), "healthy"); // severity 0.667
  assert.equal(s(100), "watch"); // 1.0
  assert.equal(s(80), "concern"); // 1.25
  assert.equal(s(60), "critical"); // 1.667
});

test("growth bands (15% line): -10% healthy, -15% watch, -20% concern, -25% critical, any growth healthy", () => {
  const prior = st("a", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 1000 });
  const s = (rev: number) =>
    cat(computeHealthScore(st("a", { revenue_from_operations: rev }), prior, "tyre"), "growth").status;
  assert.equal(s(900), "healthy");
  assert.equal(s(850), "watch");
  assert.equal(s(800), "concern");
  assert.equal(s(750), "critical");
  assert.equal(s(2000), "healthy");
});

test("leverage bands (2.0x line): 1.0x healthy, 2.0x watch, 2.6x concern, 3.0x critical", () => {
  const s = (debt: number) =>
    cat(computeHealthScore(st("a", { total_debt: debt, total_equity: 100 }), null, "tyre"), "leverage").status;
  assert.equal(s(100), "healthy");
  assert.equal(s(200), "watch");
  assert.equal(s(260), "concern");
  assert.equal(s(300), "critical");
});

test("leverage: zero or negative equity is critical, never 'healthy' or 'no data'", () => {
  const neg = cat(computeHealthScore(st("a", { total_debt: 50, total_equity: -20 }), null, "tyre"), "leverage");
  assert.equal(neg.status, "critical");
  assert.match(neg.detail ?? "", /negative/);
  assert.equal(cat(computeHealthScore(st("a", { total_debt: 50, total_equity: 0 }), null, "tyre"), "leverage").status, "critical");
});

test("cash flow: OCF/PAT 1.0 healthy, 0.7 watch, 0.5 concern, 0.4 critical; non-positive PAT falls back to the sign of OCF", () => {
  const s = (ocf: number, pat = 100) =>
    cat(computeHealthScore(st("a", { cash_from_operations: ocf, profit_after_tax: pat }), null, "tyre"), "cash_flow").status;
  assert.equal(s(100), "healthy");
  assert.equal(s(70), "watch");
  assert.equal(s(50), "concern");
  assert.equal(s(40), "critical");
  assert.equal(s(20, -10), "watch");
  assert.equal(s(-20, -10), "critical");
});

test("categories without data are 'no_data' and left out of the overall grade", () => {
  const score = computeHealthScore(st("a", { profit_after_tax: 100 }), null, "tyre");
  assert.equal(cat(score, "liquidity").status, "no_data");
  assert.equal(cat(score, "capital_allocation").status, "no_data");
  assert.equal(score.overall, "healthy"); // only profitability has data, and it is healthy
});

test("overall grade is the average band: healthy(4) + watch(3) + concern(2) + critical(1) = 2.5 -> watch", () => {
  const score = computeHealthScore(
    st("a", {
      profit_after_tax: 100, // profitability healthy (no prior, positive)
      current_assets: 100, current_liabilities: 100, // liquidity watch (1.0x)
      total_debt: 260, total_equity: 100, // leverage concern (2.6x)
      inventory: 300, total_expenses: 1000, // inventory days 109.5 -> severity 1.825 -> critical (efficiency)
    }),
    null,
    "tyre"
  );
  assert.equal(cat(score, "profitability").status, "healthy");
  assert.equal(cat(score, "liquidity").status, "watch");
  assert.equal(cat(score, "leverage").status, "concern");
  assert.equal(cat(score, "efficiency").status, "critical");
  assert.equal(score.overall, "watch"); // (4 + 3 + 2 + 1) / 4 = 2.5
});

// --- benchmark ----------------------------------------------------------------------------

function peer(id: string, revenue: number, metrics: Record<string, number | null>): PeerRow {
  return {
    workspace_id: id, company_name: id.toUpperCase(), is_subject: false, period_label: "FY26", basis: "consolidated",
    basis_caveat: null, revenue_cr: revenue, pat_cr: revenue / 10, pbt_cr: revenue / 8, exceptional_items_cr: 0,
    prior_revenue_cr: null, prior_pat_cr: null, total_equity_cr: null, has_prior_year: false, ratios: metrics,
  };
}

const rows = [
  peer("s", 1000, { pat_margin: 0.1, inventory_days: 50 }),
  peer("p1", 1100, { pat_margin: 0.08, inventory_days: 40 }),
  peer("p2", 5000, { pat_margin: 0.12, inventory_days: 70 }),
  peer("p3", 900, { pat_margin: 0.06, inventory_days: null }),
];

test("closest peer is the nearest by revenue, excluding the subject", () => {
  assert.equal(findClosestPeer(rows, "s")?.workspace_id, "p1"); // |1100-1000| = 100 vs |900-1000| = 100 -> tie goes to the first
});

test("benchmark, higher is better: subject margin 10% is ahead of 8% and 6%, behind 12% -> 2 of 3 peers = 66.7th", () => {
  const b = getBenchmark(rows, "s", "pat_margin", "higher_is_better");
  assert.ok(near(b.percentile, (2 / 3) * 100, 1e-9));
  assert.equal(b.industryLeader?.company_name, "P2");
  assert.ok(near(b.industryAverage, (0.1 + 0.08 + 0.12 + 0.06) / 4)); // average includes the subject
  assert.ok(near(b.gapToClosestPeer, 0.02)); // 10% - 8%
  assert.ok(near(b.gapToLeader, -0.02));
  assert.equal(b.sampleSize, 4);
});

test("benchmark, lower is better: inventory days 50 beats only the 70 -> 1 of 2 peers with data", () => {
  const b = getBenchmark(rows, "s", "inventory_days", "lower_is_better");
  assert.ok(near(b.percentile, 50));
  assert.equal(b.industryLeader?.company_name, "P1"); // 40 days is best
  assert.equal(b.sampleSize, 3); // P3 has no value
});

test("benchmark: with no other peer holding a value there is no percentile", () => {
  const b = getBenchmark([peer("s", 1000, { x: 1 }), peer("p", 900, { x: null })], "s", "x");
  assert.equal(b.percentile, null);
});

test("benchmark: a subject that is not in the rows has no value and no gap", () => {
  const b = getBenchmark(rows, "nobody", "pat_margin");
  assert.equal(b.subjectValue, null);
  assert.equal(b.gapToClosestPeer, null);
});
