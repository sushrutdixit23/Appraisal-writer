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

export type SectorConfig = {
  sector_id: string;
  display_name: string;
  anomaly_thresholds: {
    peer_relative_zscore: number;
    yoy_swing_pct: number;
    exceptional_item_pct_of_pbt: number;
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
];

export const SECTOR_CONFIGS: Record<string, SectorConfig> = {
  tyre: {
    sector_id: "tyre",
    display_name: "Tyre Manufacturing",
    anomaly_thresholds: {
      peer_relative_zscore: 2.0,
      yoy_swing_pct: 15.0,
      exceptional_item_pct_of_pbt: 20.0,
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
