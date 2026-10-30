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
  piotroskiF,
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

// --- Altman Z'' and Beneish M --------------------------------------------------------------------------

import { altmanZ, beneishM, BENEISH_THRESHOLD } from "../../app/sentinel/lib/ratios";

// Assets 2,000; current assets 800, current liabilities 500 (working capital 300); retained earnings 600;
// EBIT 140 (PBT 120 + finance 20); equity 1,100; liabilities 900.
// X1 = 0.15, X2 = 0.30, X3 = 0.07, X4 = 1,100 / 900.
// Z'' = 6.56(0.15) + 3.26(0.30) + 6.72(0.07) + 1.05(1.2222) = 0.984 + 0.978 + 0.4704 + 1.28333 = 3.71573
const solid = st("a", {
  total_assets: 2000, current_assets: 800, current_liabilities: 500, retained_earnings: 600, finance_costs: 20,
  profit_before_tax: 120, total_equity: 1100, total_liabilities: 900,
});

test("Altman Z'': hand-worked score 3.7157 is in the safe zone, with the four ratios shown", () => {
  const z = altmanZ(solid)!;
  near(z.score, 0.984 + 0.978 + 0.4704 + 1.05 * (1100 / 900));
  assert.equal(z.zone, "safe");
  near(z.parts.working_capital_to_assets, 0.15);
  near(z.parts.equity_to_liabilities, 1100 / 900);
});

test("Altman Z'': the zone edges are 2.6 and 1.1, and a loss-making, over-borrowed company is in distress", () => {
  // retained earnings 0, EBIT 0, equity 0: Z = 6.56 x 0.15 = 0.984 -> distress
  const weak = st("a", { ...solid, retained_earnings: 0, profit_before_tax: -20, finance_costs: 20, total_equity: 0 });
  assert.equal(altmanZ(weak)!.zone, "distress");
  // add retained earnings 400 (X2 = 0.2 -> +0.652): 0.984 + 0.652 = 1.636 -> grey
  assert.equal(altmanZ(st("a", { ...weak, retained_earnings: 400 }))!.zone, "grey");
});

test("Altman Z'' is blank when a needed line is missing, and for a quarter", () => {
  assert.equal(altmanZ(st("a", { ...solid, retained_earnings: null })), null);
  assert.equal(altmanZ(st("a", { ...solid, current_assets: null })), null);
  assert.equal(altmanZ({ ...solid, period_type: "Q2" }), null);
  assert.equal(altmanZ(st("a", { ...solid, total_liabilities: 0 })), null);
});

// Year t-1: revenue 1,000, COGS 600 (gross margin 0.4), SG&A 100, receivables 100, current assets 400, fixed assets 300,
// assets 1,000, depreciation 50, liabilities 400. Year t: revenue 1,200, COGS 750 (0.375), SG&A 120, receivables 144,
// current assets 480, fixed assets 360, assets 1,200, depreciation 60, liabilities 480, PAT 108, CFO 78.
// DSRI 1.2, GMI 0.4/0.375 = 1.06667, AQI 1, SGI 1.2, DEPI 1, SGAI 1, LVGI 1, TATA (108-78)/1200 = 0.025.
// M = -4.84 + 1.104 + 0.5632 + 0.404 + 1.0704 + 0.115 - 0.172 + 0.116975 - 0.327 = -1.965425
const m0 = st("a", {
  period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 1000, cost_of_goods_sold: 600, sga_expense: 100,
  trade_receivables: 100, current_assets: 400, fixed_assets: 300, total_assets: 1000, depreciation_amortisation: 50, total_liabilities: 400,
});
const m1 = st("a", {
  revenue_from_operations: 1200, cost_of_goods_sold: 750, sga_expense: 120, trade_receivables: 144, current_assets: 480,
  fixed_assets: 360, total_assets: 1200, depreciation_amortisation: 60, total_liabilities: 480, profit_after_tax: 108, cash_from_operations: 78,
});

test("Beneish M: hand-worked indices and score -1.9654, below the -1.78 line so not flagged", () => {
  const m = beneishM(m1, m0)!;
  near(m.indices.dsri, 1.2);
  near(m.indices.gmi, 0.4 / 0.375);
  near(m.indices.aqi, 1);
  near(m.indices.sgi, 1.2);
  near(m.indices.depi, 1);
  near(m.indices.sgai, 1);
  near(m.indices.lvgi, 1);
  near(m.indices.tata, 0.025);
  near(m.score, -1.965425);
  assert.equal(m.flagged, false);
  assert.equal(BENEISH_THRESHOLD, -1.78);
});

test("Beneish M: profit far above cash flow pushes the score over the line", () => {
  // TATA (108 - (-300)) / 1200 = 0.34 -> +4.679 x 0.315 more than before = about -0.49
  const m = beneishM({ ...m1, cash_from_operations: -300 }, m0)!;
  assert.equal(m.flagged, true);
});

test("Beneish M is blank without a prior year, without COGS or SG&A, or for a quarter", () => {
  assert.equal(beneishM(m1, null), null);
  assert.equal(beneishM({ ...m1, cost_of_goods_sold: null }, m0), null);
  assert.equal(beneishM(m1, { ...m0, sga_expense: null }), null);
  assert.equal(beneishM({ ...m1, period_type: "Q3" }, m0), null);
});

test("both scores are registered as ratios for every sector", () => {
  const r = computeRatios({ ...solid }, null, "technology");
  near(r.altman_z!, 3.715733333);
  assert.equal(r.beneish_m, null);
  near(computeRatios(m1, m0, "general").beneish_m!, -1.965425);
});

// FY26: PAT 90, assets 2,000, CFO 160, debt 400, current assets 600, current liabilities 500 (ratio 1.2),
// revenue 1,000, COGS 600 (gross margin 0.4), 100 shares outstanding.
const p1 = st("a", {
  profit_after_tax: 90, total_assets: 2000, cash_from_operations: 160, total_debt: 400,
  current_assets: 600, current_liabilities: 500, revenue_from_operations: 1000, cost_of_goods_sold: 600, shares_outstanding: 100,
});
// FY25: PAT 70, assets 1,800, CFO 120, debt 450, current assets 500, current liabilities 460 (ratio ~1.087),
// revenue 900, COGS 600 (gross margin ~0.333), 100 shares outstanding - every signal points the right way.
const p0 = st("a", {
  period_label: "FY25", period_end_date: "2025-03-31", profit_after_tax: 70, total_assets: 1800, cash_from_operations: 120,
  total_debt: 450, current_assets: 500, current_liabilities: 460, revenue_from_operations: 900, cost_of_goods_sold: 600, shares_outstanding: 100,
});

test("Piotroski F: every signal points the right way - a clean 9 of 9", () => {
  const f = piotroskiF(p1, p0)!;
  assert.equal(f.score, 9);
  assert.equal(f.maxScore, 9);
  assert.deepEqual(f.criteria, {
    positive_roa: true, positive_cfo: true, improving_roa: true, cfo_exceeds_pat: true, decreasing_leverage: true,
    improving_current_ratio: true, no_dilution: true, improving_gross_margin: true, improving_asset_turnover: true,
  });
});

test("Piotroski F: a deteriorating, loss-making year scores the opposite signals", () => {
  // A loss, cash burning faster than the loss itself, more debt, a tighter current ratio, new shares
  // issued, a thinner margin - everything that was true above is now false.
  const weak = st("a", {
    profit_after_tax: -50, total_assets: 2200, cash_from_operations: -60, total_debt: 700,
    current_assets: 400, current_liabilities: 450, revenue_from_operations: 950, cost_of_goods_sold: 700, shares_outstanding: 130,
  });
  const f = piotroskiF(weak, p1)!;
  assert.equal(f.score, 0);
  assert.equal(f.maxScore, 9);
});

test("Piotroski F: missing shares outstanding or COGS shrinks the denominator rather than counting against the score", () => {
  const noShares = piotroskiF({ ...p1, shares_outstanding: null }, p0)!;
  assert.equal(noShares.criteria.no_dilution, null);
  assert.equal(noShares.maxScore, 8);
  assert.equal(noShares.score, 8); // the other 8 signals are all still positive

  const noCogsEither = piotroskiF({ ...p1, shares_outstanding: null, cost_of_goods_sold: null }, { ...p0, cost_of_goods_sold: null })!;
  assert.equal(noCogsEither.criteria.improving_gross_margin, null);
  assert.equal(noCogsEither.maxScore, 7);
});

test("Piotroski F is blank without a prior year, without the core inputs, or for a quarter", () => {
  assert.equal(piotroskiF(p1, null), null);
  assert.equal(piotroskiF({ ...p1, cash_from_operations: null }, p0), null);
  assert.equal(piotroskiF({ ...p1, period_type: "Q2" }, p0), null);
});

test("Piotroski F is registered as a ratio for every sector", () => {
  near(computeRatios(p1, p0, "technology").piotroski_f!, 9);
});

// Free cash flow and the cash/efficiency ratios, against hand-worked numbers.
import { assetTurnover, capexIntensity, effectiveTaxRate, fcfConversion, fcfMargin, freeCashFlow } from "../../app/sentinel/lib/ratios";

const cash = st("a", { revenue_from_operations: 100, profit_before_tax: 14, tax_expense: 4, profit_after_tax: 10, cash_from_operations: 18, capex: 8, total_assets: 80 });

test("free cash flow = cash from operations - capex: 18 - 8 = 10, a 10% margin and 1.0x of profit; a negative capex entry is the same outflow", () => {
  near(freeCashFlow(cash)!, 10);
  near(fcfMargin(cash)!, 0.1);
  near(fcfConversion(cash)!, 1);
  near(freeCashFlow({ ...cash, capex: -8 })!, 10);
  near(freeCashFlow({ ...cash, capex: 30 })!, -12); // negative free cash flow is a result, not a blank
  near(fcfMargin({ ...cash, capex: 30 })!, -0.12);
});

test("free cash flow is blank without either input and for a quarter; conversion is blank for a loss", () => {
  assert.equal(freeCashFlow({ ...cash, cash_from_operations: null }), null);
  assert.equal(freeCashFlow({ ...cash, capex: null }), null);
  assert.equal(freeCashFlow({ ...cash, period_type: "Q2" }), null);
  assert.equal(fcfConversion({ ...cash, profit_after_tax: -5 }), null);
});

test("capex intensity 8%, effective tax rate 4 / 14 = 28.6% (blank for a loss or no tax line), asset turnover on average assets", () => {
  near(capexIntensity(cash)!, 0.08);
  assert.equal(capexIntensity({ ...cash, capex: null }), null);
  near(effectiveTaxRate(cash)!, 4 / 14);
  assert.equal(effectiveTaxRate({ ...cash, profit_before_tax: -3 }), null);
  assert.equal(effectiveTaxRate({ ...cash, tax_expense: null }), null);
  near(assetTurnover(cash, null)!, 1.25); // 100 / 80, closing only
  near(assetTurnover(cash, st("a", { total_assets: 60 }))!, 100 / 70); // average of 80 and 60
  assert.equal(assetTurnover({ ...cash, period_type: "Q2" }, null), null);
});

test("the new ratios are in every sector's registry and computeRatios carries them", () => {
  const r = computeRatios(cash, null, "technology");
  near(r.fcf_margin!, 0.1);
  near(r.capex_intensity!, 0.08);
  near(r.effective_tax_rate!, 4 / 14);
  near(r.asset_turnover!, 1.25);
  near(r.fcf_conversion!, 1);
});
