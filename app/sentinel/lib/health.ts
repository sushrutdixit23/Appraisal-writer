// Sentinel — Business Health Engine (Phase 2 of the locked V1 roadmap).
// Turns the ratios engine.ts/config.ts already compute into a single
// Healthy/Watch/Concern/Critical status per category, reusing the exact
// same threshold values anomaly.ts already checks against
// (current_ratio_min, debt_equity_max, inventory_days_max,
// receivable_days_max, yoy_swing_pct) rather than inventing a second,
// possibly-inconsistent set of numbers for the same ratio. A category a
// company hasn't supplied the underlying data for (Balance Sheet fields,
// or — for Cash Flow/Capital Allocation — fields this schema doesn't
// collect at all yet) resolves to "no_data", never a guessed status —
// same null-safe convention the anomaly detectors use.
//
// Every threshold-based category is banded as a severity multiple of the
// SAME line anomaly.ts already flags at: <=0.7x = healthy, <=1.0x =
// watch (approaching the line), <=1.4x = concern (past the line, same
// territory anomaly.ts would flag), >1.4x = critical. This mirrors the
// "how far past the threshold" severity logic computeConfidence already
// uses, just banded into four labels instead of a continuous score.
//
// Profitability and Growth have no existing anomaly.ts threshold to
// borrow (yoy_swing_pct is a symmetric volatility check, not a "growth
// is bad" floor). Growth reuses yoy_swing_pct anyway (downside only,
// same severity bands). Profitability's 2-percentage-point "comfortable
// margin move" reference is a new, unvalidated starting assumption —
// flagged here the same way config.ts flags its own unvalidated
// thresholds, worth calibrating against real filings later rather than
// treated as authoritative.
//
// Efficiency uses inventory_days and Working Capital uses
// receivable_days — kept as two separate categories rather than both
// pulling from the same working-capital-days signal twice under
// different labels. payable_days is computed by engine.ts but has no
// configured threshold anywhere in config.ts, so it's left out of
// status here (informational only wherever it's shown elsewhere) rather
// than graded against a number nobody has reviewed.

import { computeRatios } from "./engine";
import { getSectorConfig } from "./config";
import type { FinancialStatement } from "./types";

export type HealthStatus = "healthy" | "watch" | "concern" | "critical" | "no_data";

export type HealthCategory = {
  key: string;
  label: string;
  status: HealthStatus;
  metric_label: string | null;
  value: number | null;
  detail: string | null;
};

export type HealthScore = {
  overall: HealthStatus;
  categories: HealthCategory[];
};

const STATUS_SCORE: Record<Exclude<HealthStatus, "no_data">, number> = {
  healthy: 4,
  watch: 3,
  concern: 2,
  critical: 1,
};

/** severity: 0 = comfortably fine, 1.0 = exactly at the existing
 * anomaly.ts threshold line, higher = further past it. Same four bands
 * used for every ratio-vs-threshold category below. */
function bandFromSeverity(severity: number): Exclude<HealthStatus, "no_data"> {
  if (severity <= 0.7) return "healthy";
  if (severity <= 1.0) return "watch";
  if (severity <= 1.4) return "concern";
  return "critical";
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function computeHealthScore(
  stmt: FinancialStatement,
  prior: FinancialStatement | null,
  sector: string
): HealthScore {
  const cfg = getSectorConfig(sector);
  const t = cfg.anomaly_thresholds;
  const ratios = computeRatios(stmt, prior, sector);
  const categories: HealthCategory[] = [];

  // Profitability — PAT margin trend vs. the prior period's own margin.
  // Negative margin is always at least "concern" regardless of trend —
  // a company can be improving and still be loss-making.
  {
    const margin = ratios["pat_margin"];
    const priorMargin =
      prior && prior.revenue_from_operations
        ? prior.profit_after_tax / prior.revenue_from_operations
        : null;
    if (margin == null) {
      categories.push({
        key: "profitability", label: "Profitability", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else if (priorMargin == null) {
      // No prior period to compare — fall back to the sign of the
      // margin itself rather than showing no_data for a company's very
      // first period on file.
      const status = margin < 0 ? "critical" : margin === 0 ? "concern" : "healthy";
      categories.push({
        key: "profitability", label: "Profitability", status,
        metric_label: "PAT margin", value: margin,
        detail: `PAT margin is ${pct(margin)} — no prior period on file to compare the trend`,
      });
    } else {
      const deltaPP = (margin - priorMargin) * 100; // percentage points
      let status = bandFromSeverity(deltaPP >= 0 ? 0 : Math.abs(deltaPP) / 2);
      if (margin < 0 && status !== "critical") status = "concern";
      const direction = deltaPP >= 0 ? "expanded" : "contracted";
      categories.push({
        key: "profitability", label: "Profitability", status,
        metric_label: "PAT margin", value: margin,
        detail: `PAT margin ${direction} ${Math.abs(deltaPP).toFixed(1)}pp vs. prior period, to ${pct(margin)}`,
      });
    }
  }

  // Liquidity — current ratio vs. current_ratio_min (existing threshold).
  {
    const ratio = ratios["current_ratio"];
    if (ratio == null) {
      categories.push({
        key: "liquidity", label: "Liquidity", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = t.current_ratio_min / Math.max(ratio, 0.01);
      categories.push({
        key: "liquidity", label: "Liquidity", status: bandFromSeverity(severity),
        metric_label: "Current ratio", value: ratio,
        detail: `Current ratio of ${ratio.toFixed(2)}x vs. the ${t.current_ratio_min.toFixed(2)}x threshold`,
      });
    }
  }

  // Efficiency — inventory days vs. inventory_days_max (existing threshold).
  {
    const invDays = ratios["inventory_days"];
    if (invDays == null) {
      categories.push({
        key: "efficiency", label: "Efficiency", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = invDays / t.inventory_days_max;
      categories.push({
        key: "efficiency", label: "Efficiency", status: bandFromSeverity(severity),
        metric_label: "Inventory days", value: invDays,
        detail: `${invDays.toFixed(0)} inventory days vs. the ${t.inventory_days_max.toFixed(0)}-day threshold`,
      });
    }
  }

  // Growth — YoY revenue growth, downside-only, reusing yoy_swing_pct
  // (the same threshold detectYoySwings already checks against).
  {
    const growth = ratios["yoy_revenue_growth"];
    if (growth == null) {
      categories.push({
        key: "growth", label: "Growth", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const threshold = t.yoy_swing_pct / 100;
      const severity = growth >= 0 ? 0 : Math.abs(growth) / threshold;
      const direction = growth >= 0 ? "grew" : "declined";
      categories.push({
        key: "growth", label: "Growth", status: bandFromSeverity(severity),
        metric_label: "Revenue YoY", value: growth,
        detail: `Revenue ${direction} ${pct(Math.abs(growth))} YoY`,
      });
    }
  }

  // Leverage — debt-to-equity vs. debt_equity_max (existing threshold).
  {
    const de = ratios["debt_to_equity"];
    if (de == null) {
      categories.push({
        key: "leverage", label: "Leverage", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = de / t.debt_equity_max;
      categories.push({
        key: "leverage", label: "Leverage", status: bandFromSeverity(severity),
        metric_label: "Debt-to-equity", value: de,
        detail: `Debt-to-equity of ${de.toFixed(2)}x vs. the ${t.debt_equity_max.toFixed(2)}x threshold`,
      });
    }
  }

  // Cash Flow — no cash-flow fields are extracted anywhere in the schema
  // yet (see types.ts). Permanently no_data until that changes.
  categories.push({
    key: "cash_flow", label: "Cash Flow", status: "no_data",
    metric_label: null, value: null,
    detail: "Cash Flow statement not yet extracted for this company",
  });

  // Working Capital — receivable days vs. receivable_days_max (existing
  // threshold). See file header on why payable_days isn't included.
  {
    const recDays = ratios["receivable_days"];
    if (recDays == null) {
      categories.push({
        key: "working_capital", label: "Working Capital", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = recDays / t.receivable_days_max;
      categories.push({
        key: "working_capital", label: "Working Capital", status: bandFromSeverity(severity),
        metric_label: "Receivable days", value: recDays,
        detail: `${recDays.toFixed(0)} receivable days vs. the ${t.receivable_days_max.toFixed(0)}-day threshold`,
      });
    }
  }

  // Capital Allocation — needs ROE/ROCE/dividend data this schema
  // doesn't model yet. Permanently no_data until that changes.
  categories.push({
    key: "capital_allocation", label: "Capital Allocation", status: "no_data",
    metric_label: null, value: null,
    detail: "ROE/ROCE/dividend data not yet modeled",
  });

  // Overall — equal-weighted average of every category that has data,
  // rounded back to the nearest band. no_data only if nothing at all is
  // computable (shouldn't happen in practice — Profitability and Growth
  // only need the Income Statement, which every statement has).
  const scored = categories.filter(
    (c): c is HealthCategory & { status: Exclude<HealthStatus, "no_data"> } => c.status !== "no_data"
  );
  let overall: HealthStatus = "no_data";
  if (scored.length > 0) {
    const avg = scored.reduce((sum, c) => sum + STATUS_SCORE[c.status], 0) / scored.length;
    overall = avg >= 3.5 ? "healthy" : avg >= 2.5 ? "watch" : avg >= 1.5 ? "concern" : "critical";
  }

  return { overall, categories };
}
