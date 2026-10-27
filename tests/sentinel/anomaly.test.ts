// Anomaly detectors and the confidence score, against hand-computed cases.

import test from "node:test";
import assert from "node:assert/strict";
import {
  computeConfidence,
  detectExceptionalItems,
  detectLeverageRisk,
  detectLiquidityRisk,
  detectPeerRelativeOutliers,
  detectWorkingCapitalStress,
  detectYoySwings,
  groupFlagsByWorkspace,
  runAllChecks,
} from "../../app/sentinel/lib/anomaly";
import { buildPeerTable } from "../../app/sentinel/lib/engine";
import type { AnomalyFlag, PeerRow } from "../../app/sentinel/lib/types";
import { near, st, ws } from "./helpers";

/** A peer row with only the fields a detector reads. */
function row(id: string, over: Partial<PeerRow> & { ratios?: Record<string, number | null> } = {}): PeerRow {
  return {
    workspace_id: id,
    company_name: id.toUpperCase(),
    is_subject: false,
    period_label: "FY26",
    basis: "consolidated",
    basis_caveat: null,
    revenue_cr: 1000,
    pat_cr: 80,
    pbt_cr: 100,
    exceptional_items_cr: 0,
    prior_revenue_cr: null,
    prior_pat_cr: null,
    total_equity_cr: null,
    has_prior_year: false,
    ratios: {},
    ...over,
  };
}

// --- year-on-year swings ------------------------------------------------------------------

test("yoy swing: revenue +20% with a 15% threshold flags at severity 20/15", () => {
  const flags = detectYoySwings([row("a", { ratios: { yoy_revenue_growth: 0.2 }, revenue_cr: 1200, prior_revenue_cr: 1000 })], "tyre");
  assert.equal(flags.length, 1);
  assert.ok(near(flags[0].severity, 0.2 / 0.15));
  assert.match(flags[0].description, /grew 20\.0% YoY/);
});

test("yoy swing: exactly at the threshold does not flag, just past it does", () => {
  assert.equal(detectYoySwings([row("a", { ratios: { yoy_revenue_growth: 0.15 } })], "tyre").length, 0);
  assert.equal(detectYoySwings([row("a", { ratios: { yoy_revenue_growth: 0.151 } })], "tyre").length, 1);
});

test("yoy swing: a loss turning to profit is described in rupees, as an improvement", () => {
  const r = row("a", { ratios: { yoy_pat_growth: 4.3823 }, pat_cr: 1896.1, prior_pat_cr: -560.6 });
  const [flag] = detectYoySwings([r], "tyre");
  assert.match(flag.description, /turned around from a loss of ₹560\.6 cr to ₹1,896\.1 cr/);
  assert.match(flag.description, /improvement/);
});

test("yoy swing: a loss that narrows from -100 to -50 is reported as narrowing, not as a decline", () => {
  const [flag] = detectYoySwings([row("a", { ratios: { yoy_pat_growth: 0.5 }, pat_cr: -50, prior_pat_cr: -100 })], "tyre");
  assert.match(flag.description, /loss narrowed from ₹100\.0 cr to ₹50\.0 cr/);
});

test("yoy swing: a loss that widens is reported as widening", () => {
  const [flag] = detectYoySwings([row("a", { ratios: { yoy_pat_growth: -1 }, pat_cr: -200, prior_pat_cr: -100 })], "tyre");
  assert.match(flag.description, /loss widened from ₹100\.0 cr to ₹200\.0 cr/);
});

test("yoy swing: profit to loss is called a swing into losses, not '250% decline'", () => {
  const [flag] = detectYoySwings([row("a", { ratios: { yoy_pat_growth: -2.5 }, pat_cr: -150, prior_pat_cr: 100 })], "tyre");
  assert.match(flag.description, /swung from ₹100\.0 cr to a loss of ₹150\.0 cr/);
});

// --- peer-relative outliers ---------------------------------------------------------------

const margins = (vals: number[]) => vals.map((v, i) => row(`c${i}`, { ratios: { ebitda_margin: v, pat_margin: 0.1 } }));

test("peer outlier: one extreme company among five IS flagged (the old formula could not, max z was 2.0)", () => {
  // others 0.10 0.11 0.12 0.13: mean 0.115, sample sd sqrt(0.0005/3) = 0.012910, z = (0.40 - 0.115) / 0.012910
  const flags = detectPeerRelativeOutliers(margins([0.1, 0.11, 0.12, 0.13, 0.4]), "tyre").filter((f) => f.metric === "ebitda_margin");
  assert.equal(flags.length, 1);
  assert.equal(flags[0].workspace_id, "c4");
  assert.ok(near(flags[0].severity, 0.285 / Math.sqrt(0.0005 / 3) / 2, 1e-6));
  assert.match(flags[0].description, /above the mean of the other 4 peers \(11\.5%\)/);
});

test("peer outlier: a company just inside the band is not flagged", () => {
  // others 0.10 0.11 0.12 0.13 -> mean 0.115, sd 0.01291; 0.13 + ... pick 0.14: z = 0.025/0.01291 = 1.94 < 2
  const flags = detectPeerRelativeOutliers(margins([0.1, 0.11, 0.12, 0.13, 0.14]), "tyre");
  assert.equal(flags.length, 0);
});

test("peer outlier: fewer than four companies gives no flag (a baseline of two says nothing)", () => {
  assert.equal(detectPeerRelativeOutliers(margins([0.1, 0.11, 0.4]), "tyre").length, 0);
});

test("peer outlier: companies without the metric are left out of everyone's baseline", () => {
  const rows = [...margins([0.1, 0.11, 0.12, 0.13, 0.4]), row("none", { ratios: { ebitda_margin: null, pat_margin: null } })];
  const flags = detectPeerRelativeOutliers(rows, "tyre").filter((f) => f.metric === "ebitda_margin");
  assert.deepEqual(flags.map((f) => f.workspace_id), ["c4"]);
});

test("peer outlier: identical peers give no flag instead of dividing by zero", () => {
  assert.equal(detectPeerRelativeOutliers(margins([0.1, 0.1, 0.1, 0.1, 0.2]), "tyre").length, 0);
});

// --- exceptional items --------------------------------------------------------------------

test("exceptional items: a loss of 400 inside PBT 600 is 40% of pre-exceptional PBT 1000, past 20%", () => {
  const r = row("a", { pbt_cr: 600, exceptional_items_cr: 400, ratios: { exceptional_item_pct_of_pbt: 0.4 } });
  const [flag] = detectExceptionalItems([r], "tyre");
  assert.ok(near(flag.severity, 2));
  assert.match(flag.description, /exceptional loss \(₹400\.0 cr\) is 40\.0% of pre-exceptional PBT \(₹1,000\.0 cr\)/);
});

test("exceptional items: a gain is called a gain", () => {
  const r = row("a", { pbt_cr: 150, exceptional_items_cr: -100, ratios: { exceptional_item_pct_of_pbt: 2 } });
  const [flag] = detectExceptionalItems([r], "tyre");
  assert.match(flag.description, /exceptional gain \(₹100\.0 cr\) is 200\.0% of pre-exceptional PBT \(₹50\.0 cr\)/);
});

test("exceptional items: at or under 20% does not flag", () => {
  assert.equal(detectExceptionalItems([row("a", { ratios: { exceptional_item_pct_of_pbt: 0.2 } })], "tyre").length, 0);
});

// --- liquidity, leverage, working capital -------------------------------------------------

test("liquidity: current ratio 0.8 against a 1.0 floor flags at severity 1.25; 1.0 does not", () => {
  const [flag] = detectLiquidityRisk([row("a", { ratios: { current_ratio: 0.8 } })], "tyre");
  assert.ok(near(flag.severity, 1.25));
  assert.equal(detectLiquidityRisk([row("a", { ratios: { current_ratio: 1.0 } })], "tyre").length, 0);
  assert.equal(detectLiquidityRisk([row("a", { ratios: { current_ratio: null } })], "tyre").length, 0);
});

test("leverage: D/E 3.0 against 2.0 flags at 1.5; 2.0 does not", () => {
  const [flag] = detectLeverageRisk([row("a", { ratios: { debt_to_equity: 3 } })], "tyre");
  assert.ok(near(flag.severity, 1.5));
  assert.equal(detectLeverageRisk([row("a", { ratios: { debt_to_equity: 2 } })], "tyre").length, 0);
});

test("leverage: negative equity is flagged even though debt-to-equity is undefined", () => {
  const flags = detectLeverageRisk([row("a", { total_equity_cr: -50, ratios: { debt_to_equity: null } })], "tyre");
  assert.equal(flags.length, 1);
  assert.equal(flags[0].metric, "total_equity");
  assert.match(flags[0].description, /negative/);
});

test("working capital: 73 inventory days against 60 and 40 receivable days against 60", () => {
  const flags = detectWorkingCapitalStress([row("a", { ratios: { inventory_days: 73, receivable_days: 40 } })], "tyre");
  assert.equal(flags.length, 1);
  assert.equal(flags[0].metric, "inventory_days");
  assert.ok(near(flags[0].severity, 73 / 60));
});

// --- confidence score ---------------------------------------------------------------------

const flag = (type: AnomalyFlag["flag_type"], severity: number): AnomalyFlag => ({
  workspace_id: "a", company_name: "A", period_label: "FY26", flag_type: type, metric: "m", value: 1, threshold: 1, severity, description: "d",
});

test("confidence: no flags is 0", () => {
  assert.equal(computeConfidence([], 5).score, 0);
});

test("confidence: one flag at the line, five peers = 45 + 0 + 3 + 0 = 48", () => {
  assert.equal(computeConfidence([flag("yoy_swing", 1)], 5).score, 48);
});

test("confidence: three flags, three types, max severity 2 = 45 + 20 (capped from 24) + 9 + 15 = 89", () => {
  const r = computeConfidence([flag("yoy_swing", 1.2), flag("exceptional_item", 2), flag("liquidity", 1.1)], 5);
  assert.equal(r.score, 89);
  assert.equal(r.signals.corroborating_flag_types, 3);
  assert.equal(r.signals.max_severity, 2);
});

test("confidence: fewer than five peers costs ten points (89 -> 79); the floor is 30 and the cap 95", () => {
  const three = [flag("yoy_swing", 1.2), flag("exceptional_item", 2), flag("liquidity", 1.1)];
  assert.equal(computeConfidence(three, 3).score, 79);
  assert.equal(computeConfidence([flag("yoy_swing", 1)], 3).score, 38);
  const many = (["yoy_swing", "peer_outlier", "exceptional_item", "liquidity", "leverage"] as const).map((t) => flag(t, 5));
  assert.equal(computeConfidence(many, 5).score, 95);
});

// --- grouping and the full pipeline --------------------------------------------------------

test("flags group per company and period", () => {
  const a1 = { ...flag("yoy_swing", 1), workspace_id: "a" };
  const a2 = { ...flag("liquidity", 1), workspace_id: "a" };
  const b1 = { ...flag("yoy_swing", 1), workspace_id: "b" };
  const groups = groupFlagsByWorkspace([a1, b1, a2]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.length).sort(), [1, 2]);
});

test("end to end: a loss-making peer in lakh and a profitable one in crore produce correct, comparable flags", () => {
  const workspaces = [ws("a", { currency_unit: "INR_LAKH" }), ws("b")];
  const statements = [
    // A, in lakh: revenue 12,00,000 lakh (= 12,000 cr) up from 10,00,000; PAT swings -1,00,000 -> +50,000 lakh
    st("a", { revenue_from_operations: 1_200_000, profit_before_tax: 60_000, profit_after_tax: 50_000 }),
    st("a", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 1_000_000, profit_before_tax: -90_000, profit_after_tax: -100_000 }),
    // B, in crore: steady
    st("b", { revenue_from_operations: 11_000, profit_before_tax: 900, profit_after_tax: 700 }),
    st("b", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 10_500, profit_before_tax: 850, profit_after_tax: 660 }),
  ];
  const rows = buildPeerTable(workspaces, statements, "a", "FY");
  const flags = runAllChecks(rows, "tyre").filter((f) => f.workspace_id === "a" && f.flag_type === "yoy_swing");
  const pat = flags.find((f) => f.metric === "yoy_pat_growth")!;
  assert.ok(pat, "the PAT turnaround is flagged");
  assert.match(pat.description, /turned around from a loss of ₹1,000\.0 cr to ₹500\.0 cr/); // lakh converted to crore
  assert.ok(near(pat.value, 1.5)); // (50,000 + 100,000) / 100,000
  const rev = flags.find((f) => f.metric === "yoy_revenue_growth")!;
  assert.ok(near(rev.value, 0.2)); // 1,200,000 vs 1,000,000
});
