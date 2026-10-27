// Credit ratios, against hand-worked numbers.

import test from "node:test";
import assert from "node:assert/strict";
import {
  cashConversionToEbitda,
  cashConversionToPat,
  dupont,
  ebit,
  interestCover,
  netDebtToEbitda,
  returnOnCapitalEmployed,
  returnOnEquity,
} from "../../app/sentinel/lib/ratios";
import { computeHealthScore } from "../../app/sentinel/lib/health";
import { computeRatios } from "../../app/sentinel/lib/engine";
import { near, st } from "./helpers";

// FY26: revenue 1,000; EBITDA 200; finance costs 20; PBT 120 (so EBIT 140); PAT 90; CFO 160.
// Balance sheet: assets 2,000, current liabilities 500 (capital employed 1,500), equity 1,100, debt 400, cash 100.
const now = st("a", {
  revenue_from_operations: 1000, ebitda: 200, finance_costs: 20, profit_before_tax: 120, profit_after_tax: 90,
  cash_from_operations: 160, total_assets: 2000, current_liabilities: 500, total_equity: 1100, total_debt: 400,
  cash_and_equivalents: 100,
});
// FY25 balances: assets 1,800, current liabilities 400 (capital employed 1,400), equity 900.
const before = st("a", {
  period_label: "FY25", period_end_date: "2025-03-31", total_assets: 1800, current_liabilities: 400, total_equity: 900,
});

test("EBIT is profit before tax with finance costs added back; no finance cost line means no EBIT", () => {
  assert.equal(ebit(now), 140);
  assert.equal(ebit(st("a", { finance_costs: null })), null);
});

test("interest cover: EBIT 140 / finance costs 20 = 7x; no borrowing cost has no ratio", () => {
  near(interestCover(now)!, 7);
  assert.equal(interestCover(st("a", { finance_costs: 0 })), null);
});

test("ROE: PAT 90 over average equity (1,100 + 900) / 2 = 1,000 is 9%; with no prior year, closing equity 1,100 gives 8.18%", () => {
  near(returnOnEquity(now, before)!, 0.09);
  near(returnOnEquity(now, null)!, 90 / 1100);
});

test("ROCE: EBIT 140 over average capital employed (1,500 + 1,400) / 2 = 1,450 is 9.655%", () => {
  near(returnOnCapitalEmployed(now, before)!, 140 / 1450);
  near(returnOnCapitalEmployed(now, null)!, 140 / 1500);
});

test("net debt to EBITDA: (400 - 100) / 200 = 1.5x; more cash than debt is a negative number, not null", () => {
  near(netDebtToEbitda(now)!, 1.5);
  near(netDebtToEbitda(st("a", { ebitda: 200, total_debt: 50, cash_and_equivalents: 150 }))!, -0.5);
});

test("cash conversion: CFO 160 / EBITDA 200 = 0.8; CFO 160 / PAT 90 = 1.78", () => {
  near(cashConversionToEbitda(now)!, 0.8);
  near(cashConversionToPat(now)!, 160 / 90);
});

test("a zero or negative denominator is null, never a misleading negative ratio", () => {
  assert.equal(returnOnEquity(st("a", { total_equity: -100, profit_after_tax: 50 }), null), null);
  assert.equal(returnOnEquity(st("a", { total_equity: 0, profit_after_tax: 50 }), null), null);
  assert.equal(cashConversionToPat(st("a", { profit_after_tax: -10, cash_from_operations: 40 })), null);
  assert.equal(cashConversionToEbitda(st("a", { ebitda: 0, cash_from_operations: 40 })), null);
  assert.equal(netDebtToEbitda(st("a", { ebitda: -5, total_debt: 10, cash_and_equivalents: 1 })), null);
});

test("a missing input is null, not zero", () => {
  assert.equal(returnOnEquity(st("a", { total_equity: null }), null), null);
  assert.equal(returnOnCapitalEmployed(st("a", { total_assets: null }), null), null);
  assert.equal(netDebtToEbitda(st("a", { cash_and_equivalents: null, total_debt: 10, ebitda: 5 })), null);
  assert.equal(cashConversionToEbitda(st("a", { cash_from_operations: null, ebitda: 5 })), null);
});

test("a quarter has no return or leverage ratio: a quarter of earnings over a full balance would read four times too small", () => {
  const q = { ...now, period_type: "Q3" as const };
  assert.equal(returnOnEquity(q, before), null);
  assert.equal(returnOnCapitalEmployed(q, before), null);
  assert.equal(netDebtToEbitda(q), null);
  assert.equal(dupont(q, before), null);
});

test("DuPont: 9% margin x 0.526 turnover x 1.9 multiplier multiplies back to the ROE", () => {
  // average assets (2,000 + 1,800) / 2 = 1,900; average equity 1,000
  const d = dupont(now, before)!;
  near(d.net_margin, 0.09);
  near(d.asset_turnover, 1000 / 1900);
  near(d.equity_multiplier, 1.9);
  near(d.return_on_equity, returnOnEquity(now, before)!);
});

test("every sector's ratio set carries the new ratios, and they resolve through computeRatios", () => {
  const r = computeRatios(now, before, "tyre");
  near(r.roe!, 0.09);
  near(r.interest_cover!, 7);
  near(r.net_debt_to_ebitda!, 1.5);
  for (const sector of ["fmcg", "general"]) near(computeRatios(now, before, sector).roce!, 140 / 1450);
});

test("capital allocation is graded on ROCE against the sector floor (tyre 10%): 9.66% is just past the line (concern), 20.7% healthy, a loss critical", () => {
  const grade = (s: typeof now) => computeHealthScore(s, before, "tyre").categories.find((c) => c.key === "capital_allocation")!;
  assert.equal(grade(now).status, "concern"); // floor 10% / 9.655% = 1.036 -> past the line
  assert.equal(grade(st("a", { ...now, profit_before_tax: 280 })).status, "healthy"); // EBIT 300 / 1,450 = 20.7%
  assert.equal(grade(st("a", { ...now, profit_before_tax: -300 })).status, "critical");
  assert.equal(grade(st("a", { ...now, total_assets: null })).status, "no_data");
});

test("the technology sector exists, resolves every ratio, and is offered for new projects", async () => {
  const { getSectorConfig, SECTOR_CONFIGS } = await import("../../app/sentinel/lib/config");
  assert.ok("technology" in SECTOR_CONFIGS);
  const cfg = getSectorConfig("technology");
  assert.equal(cfg.anomaly_thresholds.roce_min, 0.2);
  assert.match(cfg.narrative_context, /utilisation|attrition/);
  near(computeRatios(now, before, "technology").interest_cover!, 7);
});
