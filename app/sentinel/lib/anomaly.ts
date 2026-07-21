// Sentinel — anomaly detection + confidence scoring, rebuilt around
// workspace_id. All three detectors now record `severity` (multiples
// past threshold, in comparable units) so computeConfidence has an
// honest, transparent signal to work from instead of an LLM guessing
// a percentage.

import { getSectorConfig } from "./config";
import type { AnomalyFlag, PeerRow } from "./types";

const PEER_RELATIVE_METRICS = ["ebitda_margin", "pat_margin"];

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const inr = (v: number) =>
  `\u20b9${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;

export function detectYoySwings(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const thresholdPct = cfg.anomaly_thresholds.yoy_swing_pct;
  const threshold = thresholdPct / 100;
  const flags: AnomalyFlag[] = [];

  for (const metric of ["yoy_revenue_growth", "yoy_pat_growth"]) {
    for (const row of rows) {
      const value = row.ratios[metric];
      if (value == null || Math.abs(value) <= threshold) continue;
      const direction = value > 0 ? "grew" : "declined";
      const metricLabel = metric.replace("yoy_", "").replace(/_/g, " ");
      flags.push({
        workspace_id: row.workspace_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "yoy_swing",
        metric,
        value,
        threshold,
        severity: Math.abs(value) / threshold,
        description:
          `${metricLabel} ${direction} ${pct(Math.abs(value))} YoY, ` +
          `past the configured \u00b1${thresholdPct.toFixed(0)}% swing threshold`,
      });
    }
  }
  return flags;
}

/** Z-score each company's ratio against the peer set's own distribution.
 * With a 5-company peer set, treat this as "worth a second look," not
 * statistical significance — that caveat is carried through to
 * computeConfidence via peerSampleSize, not just stated in prose. */
export function detectPeerRelativeOutliers(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const zThreshold = cfg.anomaly_thresholds.peer_relative_zscore;
  const flags: AnomalyFlag[] = [];

  for (const metric of PEER_RELATIVE_METRICS) {
    const values = rows
      .map((r) => r.ratios[metric])
      .filter((v): v is number => v != null);
    if (values.length < 3) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdev = Math.sqrt(variance);
    if (stdev === 0) continue;

    for (const row of rows) {
      const value = row.ratios[metric];
      if (value == null) continue;
      const z = (value - mean) / stdev;
      if (Math.abs(z) <= zThreshold) continue;
      const direction = z > 0 ? "above" : "below";
      flags.push({
        workspace_id: row.workspace_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "peer_outlier",
        metric,
        value,
        threshold: zThreshold,
        severity: Math.abs(z) / zThreshold,
        description:
          `${metric.replace(/_/g, " ")} of ${pct(value)} is ${Math.abs(z).toFixed(1)} std dev ` +
          `${direction} the ${values.length}-company peer mean of ${pct(mean)} ` +
          `(n=${values.length} \u2014 small sample, treat as a lead not a verdict)`,
      });
    }
  }
  return flags;
}

export function detectExceptionalItems(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const thresholdPct = cfg.anomaly_thresholds.exceptional_item_pct_of_pbt;
  const threshold = thresholdPct / 100;
  const flags: AnomalyFlag[] = [];

  for (const row of rows) {
    const ratio = row.ratios["exceptional_item_pct_of_pbt"];
    if (ratio == null || ratio <= threshold) continue;
    const preExceptionalPbt = row.pbt_cr + row.exceptional_items_cr;
    flags.push({
      workspace_id: row.workspace_id,
      company_name: row.company_name,
      period_label: row.period_label,
      flag_type: "exceptional_item",
      metric: "exceptional_item_pct_of_pbt",
      value: ratio,
      threshold,
      severity: ratio / threshold,
      description:
        `exceptional items (${inr(row.exceptional_items_cr)}) are ` +
        `${pct(ratio)} of pre-exceptional PBT (${inr(preExceptionalPbt)}), ` +
        `past the configured ${thresholdPct.toFixed(0)}% threshold`,
    });
  }
  return flags;
}

export function runAllChecks(rows: PeerRow[], sector: string): AnomalyFlag[] {
  return [
    ...detectYoySwings(rows, sector),
    ...detectPeerRelativeOutliers(rows, sector),
    ...detectExceptionalItems(rows, sector),
  ];
}

export function groupFlagsByWorkspace(flags: AnomalyFlag[]): AnomalyFlag[][] {
  const groups = new Map<string, AnomalyFlag[]>();
  for (const flag of flags) {
    const key = `${flag.workspace_id}|${flag.period_label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(flag);
  }
  return [...groups.values()];
}

export type ConfidenceResult = {
  score: number; // 0-100, deliberately capped below 95 — see note below
  signals: {
    flag_count: number;
    corroborating_flag_types: number;
    max_severity: number;
    peer_sample_size: number;
  };
};

/** Confidence Engine. Every input here is something we actually computed
 * — never an LLM-stated number. Deliberately capped at 95: with a
 * 5-company peer set and no historical-match or management-guidance
 * data source yet (those need Decision Memory / Document Intelligence,
 * not built), claiming near-certainty would be dishonest regardless of
 * how the math works out. The signals are returned alongside the score
 * so the UI can show its work, not just the number. */
export function computeConfidence(
  flags: AnomalyFlag[],
  peerSampleSize: number
): ConfidenceResult {
  if (flags.length === 0) {
    return {
      score: 0,
      signals: { flag_count: 0, corroborating_flag_types: 0, max_severity: 0, peer_sample_size: peerSampleSize },
    };
  }

  const corroboratingTypes = new Set(flags.map((f) => f.flag_type)).size;
  const maxSeverity = Math.max(...flags.map((f) => f.severity));

  let score = 45; // base: at least one flag fired past a configured threshold
  score += Math.min(20, (corroboratingTypes - 1) * 12); // independent detector types agreeing
  score += Math.min(15, flags.length * 3); // multiple flags on the same company/period
  score += Math.min(15, (maxSeverity - 1) * 15); // how far past the line, not just past it

  if (peerSampleSize < 5) score -= 10; // small peer set caveat

  score = Math.max(30, Math.min(95, Math.round(score)));

  return {
    score,
    signals: {
      flag_count: flags.length,
      corroborating_flag_types: corroboratingTypes,
      max_severity: Math.round(maxSeverity * 100) / 100,
      peer_sample_size: peerSampleSize,
    },
  };
}
