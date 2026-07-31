// Sentinel — sector configuration, keyed by sector string instead of a
// hardcoded single sector. COMPANY_CONFIG is gone entirely: which
// companies exist, their comparison basis, and which sector they belong
// to now live in the sentinel_workspaces table, not in code. Adding a
// new company is a database row now, not a code change. Adding a new
// SECTOR still needs an entry here (thresholds and narrative framing
// are genuinely sector-specific judgment calls, not data).

import type { FinancialStatement } from "./types";

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

// Days-outstanding ratio (inventory/receivable/payable days): num / den *
// 365. Same null-safety as safeDiv, just with the *365 folded in so
// every call site doesn't have to remember it.
function safeDays(num: number | null, den: number | null): number | null {
  const ratio = safeDiv(num, den);
  return ratio == null ? null : ratio * 365;
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
      p == null
        ? null
        : safeDiv(
            s.revenue_from_operations - p.revenue_from_operations,
            p.revenue_from_operations
          ),
  },
  {
    id: "yoy_pat_growth",
    compute: (s, p) =>
      p == null ? null : safeDiv(s.profit_after_tax - p.profit_after_tax, p.profit_after_tax),
  },
  {
    id: "exceptional_item_pct_of_pbt",
    compute: (s) =>
      safeDiv(s.exceptional_items, s.profit_before_tax + (s.exceptional_items ?? 0)),
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
    id: "debt_to_equity",
    compute: (s) => safeDiv(s.total_debt, s.total_equity),
  },
  {
    id: "inventory_days",
    // total_expenses used as the COGS proxy - the schema doesn't carry
    // a separate COGS line today. Noted as an approximation, not exact.
    compute: (s) => safeDays(s.inventory, s.total_expenses),
  },
  {
    id: "receivable_days",
    compute: (s) => safeDays(s.trade_receivables, s.revenue_from_operations),
  },
  {
    id: "payable_days",
    compute: (s) => safeDays(s.trade_payables, s.total_expenses),
  },
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
