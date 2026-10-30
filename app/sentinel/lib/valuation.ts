// Sentinel - peer valuation. Everything here needs a share price, and Sentinel has no live market feed: the
// price is a person's own manual entry on the company's Settings page, with its own "as of" date so a stale
// price is visible rather than silently assumed current (see Workspace.market_price in types.ts). Every
// function below is pure and null-safe, same convention as ratios.ts: a missing input or a non-positive
// denominator resolves to null, never a guess.

import { freeCashFlow } from "./ratios";
import type { FinancialStatement, Workspace } from "./types";

type Stmt = FinancialStatement;

function div(num: number | null, den: number | null, needPositiveDen = true): number | null {
  if (num == null || den == null || Number.isNaN(num) || Number.isNaN(den)) return null;
  if (needPositiveDen ? den <= 0 : den === 0) return null;
  return num / den;
}

/** Market price x shares outstanding, in crore (price and the share count are both raw, unit-independent
 * figures - a currency unit conversion factor has no place here, unlike the statement's own lines). */
export function marketCapCr(price: number | null | undefined, shares: number | null | undefined): number | null {
  if (price == null || shares == null || price <= 0 || shares <= 0) return null;
  return (price * shares) / 1e7;
}

/** Market cap plus net debt, in crore. `f` is the company's own crore conversion factor (croreFactor in
 * units.ts), the same one every other absolute figure on a PeerRow is already run through, so total_debt and
 * cash_and_equivalents - stored in whatever unit the company reports in - land in the same crore terms as
 * marketCapCr. Net debt only (not gross) is intentional: a profitable, well-capitalised buyer could in
 * principle fund an acquisition from its own cash, so EV is lower when cash exceeds debt, same reasoning as
 * netDebtToEbitda in ratios.ts. */
export function enterpriseValueCr(marketCap: number | null, s: Stmt, f: number): number | null {
  if (marketCap == null || s.total_debt == null || s.cash_and_equivalents == null) return null;
  return marketCap + s.total_debt * f - s.cash_and_equivalents * f;
}

/** Market cap over profit after tax - equivalently price over EPS, without needing EPS as a separate input. */
export function peRatio(marketCap: number | null, s: Stmt, f: number): number | null {
  return div(marketCap, s.profit_after_tax * f);
}

export function evToEbitda(ev: number | null, s: Stmt, f: number): number | null {
  if (s.ebitda == null) return null;
  return div(ev, s.ebitda * f);
}

export function evToSales(ev: number | null, s: Stmt, f: number): number | null {
  return div(ev, s.revenue_from_operations * f);
}

/** Profit after tax per share, in rupees. The share count is a raw number; a crore is 1e7, so the statement figure (in the company's unit, times `f`
 * to crore) is brought to rupees before dividing. Blank without a positive share count. A loss gives a negative EPS, which is a real figure. */
export function epsRupees(s: Stmt, f: number): number | null {
  if (s.shares_outstanding == null || s.shares_outstanding <= 0) return null;
  return (s.profit_after_tax * f * 1e7) / s.shares_outstanding;
}

/** Equity per share, in rupees. Blank when equity is zero or negative: a negative book value per share is not a figure to price against. */
export function bookValuePerShareRupees(s: Stmt, f: number): number | null {
  if (s.shares_outstanding == null || s.shares_outstanding <= 0 || s.total_equity == null || s.total_equity <= 0) return null;
  return (s.total_equity * f * 1e7) / s.shares_outstanding;
}

/** Market cap over book equity. Blank for zero or negative equity. */
export function priceToBook(marketCap: number | null, s: Stmt, f: number): number | null {
  if (s.total_equity == null) return null;
  return div(marketCap, s.total_equity * f);
}

/** Free cash flow (in crore) over market cap: the cash return at today's price. Negative when free cash flow is negative. */
export function fcfYield(marketCap: number | null, s: Stmt, f: number): number | null {
  const fcf = freeCashFlow(s);
  return fcf == null ? null : div(fcf * f, marketCap);
}

export type ValuationSet = {
  market_cap_cr: number | null;
  ev_cr: number | null;
  pe_ratio: number | null;
  ev_ebitda: number | null;
  ev_sales: number | null;
  pb_ratio: number | null;
  fcf_yield: number | null;
  fcf_cr: number | null;
  /** Per-share figures in rupees; they need shares outstanding but not a price. */
  eps: number | null;
  bvps: number | null;
};

/** Every valuation figure for one statement at once, in the crore terms the rest of a PeerRow already uses.
 * `f` is that company's own croreFactor(currency_unit) - computed once by the caller (buildPeerTable already
 * has it for revenue_cr/pat_cr) and passed in rather than recomputed here. */
export function computeValuation(ws: Workspace, s: Stmt, f: number): ValuationSet {
  const marketCap = marketCapCr(ws.market_price, s.shares_outstanding);
  const ev = enterpriseValueCr(marketCap, s, f);
  return {
    market_cap_cr: marketCap,
    ev_cr: ev,
    pe_ratio: peRatio(marketCap, s, f),
    ev_ebitda: evToEbitda(ev, s, f),
    ev_sales: evToSales(ev, s, f),
    pb_ratio: priceToBook(marketCap, s, f),
    fcf_yield: fcfYield(marketCap, s, f),
    fcf_cr: freeCashFlow(s) == null ? null : freeCashFlow(s)! * f,
    eps: epsRupees(s, f),
    bvps: bookValuePerShareRupees(s, f),
  };
}
