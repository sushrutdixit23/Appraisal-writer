// Sentinel — sector configuration, keyed by sector string instead of a
// hardcoded single sector. COMPANY_CONFIG is gone entirely: which
// companies exist, their comparison basis, and which sector they belong
// to now live in the sentinel_workspaces table, not in code. Adding a
// new company is a database row now, not a code change. Adding a new
// SECTOR still needs an entry here (thresholds and narrative framing
// are genuinely sector-specific judgment calls, not data).

import type { FinancialStatement } from "./types";
import {
  cashConversionToEbitda,
  cashConversionToPat,
  interestCover,
  netDebtToEbitda,
  returnOnCapitalEmployed,
  returnOnEquity,
} from "./ratios";

export type RatioDef = {
  id: string;
  compute: (
    stmt: FinancialStatement,
    prior: FinancialStatement | null
  ) => number | null;
};

function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

/** Days in the period the flows (revenue, expenses) cover. A balance-sheet
 * balance divided by a quarter of flows has to be scaled to a quarter, not
 * a year, or every days ratio on a quarterly statement comes out four times
 * too large. */
export function periodDays(stmt: Pick<FinancialStatement, "period_type">): number {
  return stmt.period_type === "FY" ? 365 : 365 / 4;
}

// Days-outstanding ratio (inventory/receivable/payable days): balance /
// flow * days in the period. Same null-safety as safeDiv, with the day
// count folded in so no call site has to remember it.
function safeDays(num: number | null, den: number | null, days: number): number | null {
  const ratio = safeDiv(num, den);
  return ratio == null ? null : ratio * days;
}

/** Growth against the size of the prior figure, so the sign always means
 * what it says: a loss that narrows from -100 to -50 is +50%, a loss that
 * widens to -200 is -100%. Dividing by the signed prior figure (the old
 * formula) reversed both. A zero prior year has no growth rate. */
function growth(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

export type SectorConfig = {
  sector_id: string;
  display_name: string;
  anomaly_thresholds: {
    peer_relative_zscore: number;
    yoy_swing_pct: number;
    exceptional_item_pct_of_pbt: number;
    current_ratio_min: number;
    debt_equity_max: number;
    inventory_days_max: number;
    receivable_days_max: number;
    /** Return on capital employed below which capital allocation is a concern. A starting assumption (about a
     * cost of capital), not calibrated against filings. */
    roce_min: number;
  };
  narrative_context: string;
  derived_ratios: RatioDef[];
};

const DERIVED_RATIOS: RatioDef[] = [
  {
    id: "ebitda_margin",
    compute: (s) => safeDiv(s.ebitda, s.revenue_from_operations),
  },
  {
    id: "pat_margin",
    compute: (s) => safeDiv(s.profit_after_tax, s.revenue_from_operations),
  },
  {
    id: "yoy_revenue_growth",
    compute: (s, p) =>
      p == null ? null : growth(s.revenue_from_operations, p.revenue_from_operations),
  },
  {
    id: "yoy_pat_growth",
    compute: (s, p) => (p == null ? null : growth(s.profit_after_tax, p.profit_after_tax)),
  },
  {
    // Size of the exceptional item against pre-exceptional PBT. Entered as
    // an expense/loss when positive and a gain when negative, so a large
    // exceptional GAIN is measured too (it flatters PAT just as a loss
    // depresses it). Pre-exceptional PBT of zero has no ratio.
    id: "exceptional_item_pct_of_pbt",
    compute: (s) => {
      if (s.exceptional_items == null) return null;
      const preExceptional = s.profit_before_tax + s.exceptional_items;
      if (preExceptional === 0) return null;
      return Math.abs(s.exceptional_items) / Math.abs(preExceptional);
    },
  },
  // Balance Sheet ratios — resolve to null (not zero) until a company's
  // statement actually carries current_assets/current_liabilities/etc.
  // Every detector reading these already treats null as "skip, don't
  // flag" (see anomaly.ts), so these are inert no-ops for any company
  // that hasn't supplied Balance Sheet data yet.
  {
    id: "current_ratio",
    compute: (s) => safeDiv(s.current_assets, s.current_liabilities),
  },
  {
    // Not meaningful once equity is zero or negative: dividing by it gives
    // a negative "ratio" that reads as the safest balance sheet in the
    // peer set. Negative equity is reported separately (anomaly.ts flags
    // it, health.ts grades it Critical).
    id: "debt_to_equity",
    compute: (s) =>
      s.total_equity != null && s.total_equity > 0 ? safeDiv(s.total_debt, s.total_equity) : null,
  },
  {
    id: "inventory_days",
    // total_expenses used as the COGS proxy - the schema doesn't carry
    // a separate COGS line today. Noted as an approximation, not exact.
    compute: (s) => safeDays(s.inventory, s.total_expenses, periodDays(s)),
  },
  {
    id: "receivable_days",
    compute: (s) => safeDays(s.trade_receivables, s.revenue_from_operations, periodDays(s)),
  },
  {
    id: "payable_days",
    compute: (s) => safeDays(s.trade_payables, s.total_expenses, periodDays(s)),
  },
  {
    id: "cash_conversion_cycle",
    // Inventory days + receivable days - payable days, using the exact
    // same three formulas already defined above rather than
    // recomputing them a different way. Null if any of the three
    // inputs is missing - same null-safe convention as the rest of
    // this file.
    compute: (s) => {
      const days = periodDays(s);
      const inv = safeDays(s.inventory, s.total_expenses, days);
      const rec = safeDays(s.trade_receivables, s.revenue_from_operations, days);
      const pay = safeDays(s.trade_payables, s.total_expenses, days);
      if (inv == null || rec == null || pay == null) return null;
      return inv + rec - pay;
    },
  },
  // Returns, coverage and cash conversion: definitions and null rules in ratios.ts.
  { id: "roe", compute: (s, p) => returnOnEquity(s, p) },
  { id: "roce", compute: (s, p) => returnOnCapitalEmployed(s, p) },
  { id: "interest_cover", compute: (s) => interestCover(s) },
  { id: "net_debt_to_ebitda", compute: (s) => netDebtToEbitda(s) },
  { id: "cfo_to_ebitda", compute: (s) => cashConversionToEbitda(s) },
  { id: "cfo_to_pat", compute: (s) => cashConversionToPat(s) },
];

export const SECTOR_CONFIGS: Record<string, SectorConfig> = {
  tyre: {
    sector_id: "tyre",
    display_name: "Tyre Manufacturing",
    anomaly_thresholds: {
      peer_relative_zscore: 2.0,
      yoy_swing_pct: 15.0,
      exceptional_item_pct_of_pbt: 20.0,
      // Starting assumptions, not calibrated against real tyre-sector
      // filings yet - revisit once real Balance Sheet data comes in
      // through New Project/Add Period for actual peer companies.
      current_ratio_min: 1.0,
      debt_equity_max: 2.0,
      inventory_days_max: 60,
      receivable_days_max: 60,
      roce_min: 0.1,
    },
    narrative_context:
      "Tyre manufacturers are exposed to natural rubber and crude-derivative " +
      "input cost cycles, which can swing margins independent of demand. " +
      "Distinguish margin moves driven by realization/mix from those driven " +
      "by raw material cost pass-through lag. Segment mix (replacement vs. " +
      "OEM vs. export) and standalone-vs-consolidated basis differences are " +
      "common sources of apparent-but-not-real anomalies in this sector.",
    derived_ratios: DERIVED_RATIOS,
  },
  fmcg: {
    sector_id: "fmcg",
    display_name: "FMCG / Consumer Staples",
    anomaly_thresholds: {
      peer_relative_zscore: 2.0,
      yoy_swing_pct: 12.0,
      exceptional_item_pct_of_pbt: 20.0,
      current_ratio_min: 1.0,
      debt_equity_max: 1.0,
      inventory_days_max: 60,
      receivable_days_max: 30,
      roce_min: 0.15,
    },
    narrative_context:
      "FMCG companies are exposed to commodity input cost cycles (milk, wheat, " +
      "sugar, edible oils) that can move margins independent of volume growth. " +
      "Distinguish price-led growth from volume-led growth, and watch for " +
      "seasonal demand patterns. Strong distribution/brand moats mean revenue " +
      "swings are more often company-specific than sector-wide - be cautious " +
      "about attributing a single company's move to a sector effect without " +
      "peer confirmation. Starting thresholds below are unvalidated assumptions, " +
      "not calibrated against real FMCG filings yet.",
    derived_ratios: DERIVED_RATIOS,
  },
  general: {
    sector_id: "general",
    display_name: "General / Other",
    anomaly_thresholds: {
      // Wider swing threshold than tyre's 15% - without sector-specific
      // tuning, a narrower band would false-positive on normal variation
      // for a business type we haven't calibrated against.
      peer_relative_zscore: 2.0,
      yoy_swing_pct: 20.0,
      exceptional_item_pct_of_pbt: 20.0,
      current_ratio_min: 1.0,
      debt_equity_max: 2.5,
      inventory_days_max: 75,
      receivable_days_max: 75,
      roce_min: 0.1,
    },
    narrative_context:
      "No sector-specific tuning has been applied for this company's industry " +
      "yet. Do not assume a specific cost cycle, seasonality, or margin driver " +
      "that hasn't been evidenced in this company's own data across the periods " +
      "available - reason from the numbers given, not from sector priors.",
    derived_ratios: DERIVED_RATIOS,
  },
};

export function getSectorConfig(sector: string): SectorConfig {
  const cfg = SECTOR_CONFIGS[sector];
  if (!cfg) {
    throw new Error(
      `No sector config for "${sector}" yet \u2014 add one to SECTOR_CONFIGS in config.ts ` +
        `before creating a workspace with this sector.`
    );
  }
  return cfg;
}
