// Sentinel — anomaly detection, ported from src/sentinel/anomaly/ (Python).
// Three detectors, all driven by SECTOR_CONFIG.anomaly_thresholds — nothing
// here hardcodes a number or a company name.

import { SECTOR_CONFIG } from "./config";
import type { AnomalyFlag, PeerRow } from "./types";

// Ratios checked for peer-relative outliers. Deliberately a fixed list —
// z-scoring a growth ratio against a same-period peer set conflates
// "this vs. last year" with "this company vs. peers", so this stays on
// point-in-time margin ratios where a peer z-score is a clean comparison.
const PEER_RELATIVE_METRICS = ["ebitda_margin", "pat_margin"];

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const inr = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;

export function detectYoySwings(rows: PeerRow[]): AnomalyFlag[] {
  const thresholdPct = SECTOR_CONFIG.anomaly_thresholds.yoy_swing_pct;
  const threshold = thresholdPct / 100;
  const flags: AnomalyFlag[] = [];

  for (const metric of ["yoy_revenue_growth", "yoy_pat_growth"]) {
    for (const row of rows) {
      const value = row.ratios[metric];
      if (value == null || Math.abs(value) <= threshold) continue;
      const direction = value > 0 ? "grew" : "declined";
      const metricLabel = metric.replace("yoy_", "").replace(/_/g, " ");
      flags.push({
        company_id: row.company_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "yoy_swing",
        metric,
        value,
        threshold,
        description:
          `${metricLabel} ${direction} ${pct(Math.abs(value))} YoY, ` +
          `past the configured ±${thresholdPct.toFixed(0)}% swing threshold`,
      });
    }
  }
  return flags;
}

/** Z-score each company's ratio against the peer set's own distribution.
 * With a 5-company peer set a population std dev is a thin statistical
 * basis — fine for "worth a second look", not statistical significance.
 * That distinction belongs in the narrative, not silently in the threshold. */
export function detectPeerRelativeOutliers(rows: PeerRow[]): AnomalyFlag[] {
  const zThreshold = SECTOR_CONFIG.anomaly_thresholds.peer_relative_zscore;
  const flags: AnomalyFlag[] = [];

  for (const metric of PEER_RELATIVE_METRICS) {
    const values = rows
      .map((r) => r.ratios[metric])
      .filter((v): v is number => v != null);
    if (values.length < 3) continue; // not enough peers for a meaningful spread

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdev = Math.sqrt(variance); // population std dev, matching pstdev
    if (stdev === 0) continue;

    for (const row of rows) {
      const value = row.ratios[metric];
      if (value == null) continue;
      const z = (value - mean) / stdev;
      if (Math.abs(z) <= zThreshold) continue;
      const direction = z > 0 ? "above" : "below";
      flags.push({
        company_id: row.company_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "peer_outlier",
        metric,
        value,
        threshold: zThreshold,
        description:
          `${metric.replace(/_/g, " ")} of ${pct(value)} is ${Math.abs(z).toFixed(1)} std dev ` +
          `${direction} the ${values.length}-company peer mean of ${pct(mean)} ` +
          `(n=${values.length} — small sample, treat as a lead not a verdict)`,
      });
    }
  }
  return flags;
}

export function detectExceptionalItems(rows: PeerRow[]): AnomalyFlag[] {
  const thresholdPct =
    SECTOR_CONFIG.anomaly_thresholds.exceptional_item_pct_of_pbt;
  const threshold = thresholdPct / 100;
  const flags: AnomalyFlag[] = [];

  for (const row of rows) {
    const ratio = row.ratios["exceptional_item_pct_of_pbt"];
    if (ratio == null || ratio <= threshold) continue;
    const preExceptionalPbt = row.pbt_cr + row.exceptional_items_cr;
    flags.push({
      company_id: row.company_id,
      company_name: row.company_name,
      period_label: row.period_label,
      flag_type: "exceptional_item",
      metric: "exceptional_item_pct_of_pbt",
      value: ratio,
      threshold,
      description:
        `exceptional items (${inr(row.exceptional_items_cr)}) are ` +
        `${pct(ratio)} of pre-exceptional PBT (${inr(preExceptionalPbt)}), ` +
        `past the configured ${thresholdPct.toFixed(0)}% threshold`,
    });
  }
  return flags;
}

export function runAllChecks(rows: PeerRow[]): AnomalyFlag[] {
  return [
    ...detectYoySwings(rows),
    ...detectPeerRelativeOutliers(rows),
    ...detectExceptionalItems(rows),
  ];
}

/** Group flags by (company_id, period_label), preserving first-appearance
 * order — each group becomes one bundled narrative call. */
export function groupFlagsByCompany(flags: AnomalyFlag[]): AnomalyFlag[][] {
  const groups = new Map<string, AnomalyFlag[]>();
  for (const flag of flags) {
    const key = `${flag.company_id}|${flag.period_label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(flag);
  }
  return [...groups.values()];
}

export { signedPct };
