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
