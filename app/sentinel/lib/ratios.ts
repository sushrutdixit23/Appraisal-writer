// Sentinel - the ratios a credit or equity reviewer reaches for beyond margins and days: returns on capital,
// coverage, leverage against cash earnings and cash conversion. Pure functions on statement rows; every one
// resolves to null (never zero, never a guess) when an input is missing or the ratio would mislead.
//
// Rules that apply throughout:
//  - A return or leverage ratio divides a year's flow by a balance. Only a full-year statement has a year of
//    flow, so a quarter resolves to null rather than a number four times too small. (Days ratios in config.ts
//    scale by period length instead; these cannot, because quarterly earnings are seasonal.)
//  - Balances are averaged over the year (opening and closing) when last year's statement is on file, and
//    use the closing balance otherwise. The formula text on the KPI page says which, so a reader is not left
//    to guess; compare like with like in a peer set where every company has a prior year.
//  - A denominator that is zero or negative has no meaningful ratio (negative equity would give a "negative
//    return on equity" that reads as a different thing from a loss), so it is null.

import type { FinancialStatement } from "./types";

type Stmt = FinancialStatement;

/** EBIT as reported: profit before tax with finance costs added back. Other income and exceptional items stay
 * in, because that is what the statement shows; strip them out with the exceptional-items line if needed. */
export function ebit(s: Stmt): number | null {
  if (s.finance_costs == null) return null;
  return s.profit_before_tax + s.finance_costs;
}

/** Closing balance, or the opening/closing average when the prior year has the same balance. */
function averageBalance(now: number | null, prior: number | null | undefined): number | null {
  if (now == null) return null;
  return prior == null ? now : (now + prior) / 2;
}

const isYear = (s: Stmt) => s.period_type === "FY";

function div(num: number | null, den: number | null, needPositiveDen = true): number | null {
  if (num == null || den == null) return null;
  if (needPositiveDen ? den <= 0 : den === 0) return null;
  return num / den;
}

function capitalEmployed(s: Stmt | null): number | null {
  if (!s || s.total_assets == null || s.current_liabilities == null) return null;
  return s.total_assets - s.current_liabilities;
}

/** Profit after tax over average equity. */
export function returnOnEquity(s: Stmt, prior: Stmt | null): number | null {
  if (!isYear(s)) return null;
  return div(s.profit_after_tax, averageBalance(s.total_equity, prior?.total_equity));
}

/** EBIT over average capital employed (total assets less current liabilities). */
export function returnOnCapitalEmployed(s: Stmt, prior: Stmt | null): number | null {
  if (!isYear(s)) return null;
  return div(ebit(s), averageBalance(capitalEmployed(s), capitalEmployed(prior)));
}

/** EBIT over finance costs: how many times the year's interest was earned. No borrowings cost means no ratio. */
export function interestCover(s: Stmt): number | null {
  const e = ebit(s);
  return e == null ? null : div(e, s.finance_costs);
}

/** (Debt less cash) over EBITDA. Negative when the company holds more cash than debt: a real, useful figure. */
export function netDebtToEbitda(s: Stmt): number | null {
  if (!isYear(s) || s.total_debt == null || s.cash_and_equivalents == null) return null;
  return div(s.total_debt - s.cash_and_equivalents, s.ebitda);
}

/** Cash from operations over EBITDA: how much of the earnings turned into cash. */
export function cashConversionToEbitda(s: Stmt): number | null {
  return div(s.cash_from_operations, s.ebitda);
}

/** Cash from operations over profit after tax. Persistently under 1 is the classic earnings-quality warning. */
export function cashConversionToPat(s: Stmt): number | null {
  return div(s.cash_from_operations, s.profit_after_tax);
}

export type DuPont = {
  net_margin: number;
  asset_turnover: number;
  equity_multiplier: number;
  /** net_margin x asset_turnover x equity_multiplier, which equals returnOnEquity by construction. */
  return_on_equity: number;
};

/** Return on equity split into profitability, how hard the assets work, and leverage. */
export function dupont(s: Stmt, prior: Stmt | null): DuPont | null {
  if (!isYear(s)) return null;
  const assets = averageBalance(s.total_assets, prior?.total_assets);
  const equity = averageBalance(s.total_equity, prior?.total_equity);
  const margin = div(s.profit_after_tax, s.revenue_from_operations);
  const turnover = div(s.revenue_from_operations, assets);
  const multiplier = div(assets, equity);
  if (margin == null || turnover == null || multiplier == null) return null;
  return {
    net_margin: margin,
    asset_turnover: turnover,
    equity_multiplier: multiplier,
    return_on_equity: margin * turnover * multiplier,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Distress and earnings-quality screens. Both are screens that point to questions, not verdicts.
// ---------------------------------------------------------------------------------------------------------

export type AltmanZone = "safe" | "grey" | "distress";

export type AltmanResult = {
  score: number;
  zone: AltmanZone;
  /** The four ratios before weighting, so a reviewer can see what drove the score. */
  parts: { working_capital_to_assets: number; retained_earnings_to_assets: number; ebit_to_assets: number; equity_to_liabilities: number };
};

export const altmanZone = (score: number): AltmanZone => (score > 2.6 ? "safe" : score >= 1.1 ? "grey" : "distress");

/** Altman's Z'' (the version for non-manufacturers and emerging markets, which uses book equity and no sales
 * term): 6.56 x working capital/assets + 3.26 x retained earnings/assets + 6.72 x EBIT/assets + 1.05 x book
 * equity/total liabilities. Above 2.6 safe, 1.1 to 2.6 grey, below 1.1 distress. Full years only. */
export function altmanZ(s: Stmt): AltmanResult | null {
  if (!isYear(s)) return null;
  const e = ebit(s);
  if (e == null || s.current_assets == null || s.current_liabilities == null || s.retained_earnings == null || s.total_equity == null) return null;
  const x1 = div(s.current_assets - s.current_liabilities, s.total_assets);
  const x2 = div(s.retained_earnings, s.total_assets);
  const x3 = div(e, s.total_assets);
  const x4 = div(s.total_equity, s.total_liabilities);
  if (x1 == null || x2 == null || x3 == null || x4 == null) return null;
  const score = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return {
    score,
    zone: altmanZone(score),
    parts: { working_capital_to_assets: x1, retained_earnings_to_assets: x2, ebit_to_assets: x3, equity_to_liabilities: x4 },
  };
}

export const BENEISH_THRESHOLD = -1.78;

export type BeneishResult = {
  score: number;
  /** Above the threshold the pattern resembles companies that manipulated earnings; below it, it does not. */
  flagged: boolean;
  indices: { dsri: number; gmi: number; aqi: number; sgi: number; depi: number; sgai: number; lvgi: number; tata: number };
};

/** Beneish's eight-variable M score for a full year against the year before:
 * -4.84 + 0.920 DSRI + 0.528 GMI + 0.404 AQI + 0.892 SGI + 0.115 DEPI - 0.172 SGAI + 4.679 TATA - 0.327 LVGI.
 * Two substitutions, both stated: leverage uses total liabilities / total assets (the original adds current
 * liabilities and long-term debt), and accruals are (profit after tax - cash from operations) / total assets.
 * Needs cost of goods sold and SG&A, which many filings (Indian ones included) do not print: then it is blank. */
export function beneishM(s: Stmt, prior: Stmt | null): BeneishResult | null {
  if (!isYear(s) || !prior || !isYear(prior)) return null;
  const need = [
    s.revenue_from_operations, s.cost_of_goods_sold, s.sga_expense, s.trade_receivables, s.current_assets, s.fixed_assets,
    s.total_assets, s.depreciation_amortisation, s.total_liabilities, s.cash_from_operations,
    prior.revenue_from_operations, prior.cost_of_goods_sold, prior.sga_expense, prior.trade_receivables, prior.current_assets,
    prior.fixed_assets, prior.total_assets, prior.depreciation_amortisation, prior.total_liabilities,
  ];
  if (need.some((v) => v == null)) return null;
  const n = (v: number | null | undefined) => v as number;

  const recShare = (x: Stmt) => div(n(x.trade_receivables), n(x.revenue_from_operations));
  const grossMargin = (x: Stmt) => div(n(x.revenue_from_operations) - n(x.cost_of_goods_sold), n(x.revenue_from_operations), false);
  const hardAssetShare = (x: Stmt) => {
    const r = div(n(x.current_assets) + n(x.fixed_assets), n(x.total_assets));
    return r == null ? null : 1 - r;
  };
  const depRate = (x: Stmt) => div(n(x.depreciation_amortisation), n(x.depreciation_amortisation) + n(x.fixed_assets));
  const sgaShare = (x: Stmt) => div(n(x.sga_expense), n(x.revenue_from_operations));
  const leverage = (x: Stmt) => div(n(x.total_liabilities), n(x.total_assets));
  const ratio = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);

  const dsri = ratio(recShare(s), recShare(prior));
  const gmi = ratio(grossMargin(prior), grossMargin(s));
  const aqi = ratio(hardAssetShare(s), hardAssetShare(prior));
  const sgi = ratio(n(s.revenue_from_operations), n(prior.revenue_from_operations));
  const depi = ratio(depRate(prior), depRate(s));
  const sgai = ratio(sgaShare(s), sgaShare(prior));
  const lvgi = ratio(leverage(s), leverage(prior));
  const tata = div(n(s.profit_after_tax) - n(s.cash_from_operations), n(s.total_assets));
  if ([dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata].some((v) => v == null)) return null;

  const i = { dsri: dsri!, gmi: gmi!, aqi: aqi!, sgi: sgi!, depi: depi!, sgai: sgai!, lvgi: lvgi!, tata: tata! };
  const score = -4.84 + 0.92 * i.dsri + 0.528 * i.gmi + 0.404 * i.aqi + 0.892 * i.sgi + 0.115 * i.depi - 0.172 * i.sgai + 4.679 * i.tata - 0.327 * i.lvgi;
  return { score, flagged: score > BENEISH_THRESHOLD, indices: i };
}
