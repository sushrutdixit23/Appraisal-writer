// Sentinel — sector and peer-set configuration, ported from the Python
// version's config/sectors/tyre.yaml + config/companies.yaml.
//
// One deliberate change from the Python design: ratio formulas were YAML
// strings evaluated with a sandboxed eval(). In the browser/edge runtime
// that's a non-starter, so each ratio is an explicit small function in a
// registry instead. Same config-driven spirit — adding a ratio is adding
// one entry here, nothing downstream changes — without dynamic evaluation.

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

export const SECTOR_CONFIG = {
  sector_id: "tyre",
  display_name: "Tyre Manufacturing",
  anomaly_thresholds: {
    peer_relative_zscore: 2.0,
    yoy_swing_pct: 15.0,
    exceptional_item_pct_of_pbt: 20.0,
  },
  // Prompt context for the narrative layer — not logic.
  narrative_context:
    "Tyre manufacturers are exposed to natural rubber and crude-derivative " +
    "input cost cycles, which can swing margins independent of demand. " +
    "Distinguish margin moves driven by realization/mix from those driven " +
    "by raw material cost pass-through lag. Segment mix (replacement vs. " +
    "OEM vs. export) and standalone-vs-consolidated basis differences are " +
    "common sources of apparent-but-not-real anomalies in this sector.",
  derived_ratios: [
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
        p == null
          ? null
          : safeDiv(s.profit_after_tax - p.profit_after_tax, p.profit_after_tax),
    },
    {
      id: "exceptional_item_pct_of_pbt",
      compute: (s) =>
        safeDiv(
          s.exceptional_items,
          s.profit_before_tax + (s.exceptional_items ?? 0)
        ),
    },
  ] as RatioDef[],
};

export const COMPANY_CONFIG = {
  sector: "tyre",
  fiscal_year_convention: "April-March",
  companies: [
    { id: "apollo_tyres", name: "Apollo Tyres Ltd", is_subject: true, comparison_basis: "consolidated" },
    { id: "ceat", name: "Ceat Ltd", is_subject: false, comparison_basis: "consolidated" },
    { id: "jk_tyre", name: "JK Tyre & Industries Ltd", is_subject: false, comparison_basis: "consolidated" },
    { id: "balkrishna", name: "Balkrishna Industries Ltd", is_subject: false, comparison_basis: "consolidated" },
    { id: "mrf", name: "MRF Ltd", is_subject: false, comparison_basis: "consolidated" },
  ],
};
