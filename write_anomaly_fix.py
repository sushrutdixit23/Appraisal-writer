import pathlib

path = pathlib.Path("app/sentinel/lib/anomaly.ts")
path.parent.mkdir(parents=True, exist_ok=True)

content = r'''// Sentinel — anomaly detection + confidence scoring, rebuilt around
// workspace_id. All detectors record `severity` (multiples past
// threshold, in comparable units) so computeConfidence has an honest,
// transparent signal to work from instead of an LLM guessing a
// percentage.

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

      const current = metric === "yoy_pat_growth" ? row.pat_cr : row.revenue_cr;
      // A percentage YoY swing is only sign-correct when the prior-year
      // base is positive. PeerRow doesn't carry the raw prior-year value
      // directly, but it's recoverable from the ratio itself (value =
      // (current - prior) / prior => prior = current / (1 + value)) -
      // no need for a new field or a change anywhere else. When prior
      // turns out negative, the percentage's sign is a mathematical
      // artifact (a loss-to-profit turnaround reads as a "decline"; a
      // widening loss can even read as "growth") - confirmed live on a
      // real company (Godrej Consumer FY24->FY25: -560.6cr -> +1896.1cr
      // PAT computed as "-438.3%"). In that case, describe the real ₹
      // movement instead of trusting the percentage's direction.
      const priorDenominator = 1 + value;
      const prior = priorDenominator !== 0 ? current / priorDenominator : null;
      const metricLabel = metric.replace("yoy_", "").replace(/_/g, " ");

      let description: string;
      if (prior != null && prior < 0) {
        if (current >= 0) {
          description =
            `${metricLabel} turned around from a loss of ${inr(Math.abs(prior))} to ${inr(current)} \u2014 ` +
            `the raw percentage swing (${pct(Math.abs(value))}) is a mathematical artifact of the negative ` +
            `prior-year base, not a literal decline; treat this as a genuine improvement`;
        } else {
          const widened = Math.abs(current) > Math.abs(prior);
          description =
            `${metricLabel} loss ${widened ? "widened" : "narrowed"} from ${inr(Math.abs(prior))} to ` +
            `${inr(Math.abs(current))} \u2014 the raw percentage swing (${pct(Math.abs(value))}) is a ` +
            `mathematical artifact of the negative prior-year base, not a literal ` +
            `${widened ? "decline" : "improvement"} percentage`;
        }
      } else {
        const direction = value > 0 ? "grew" : "declined";
        description =
          `${metricLabel} ${direction} ${pct(Math.abs(value))} YoY, ` +
          `past the configured \u00b1${thresholdPct.toFixed(0)}% swing threshold`;
      }

      flags.push({
        workspace_id: row.workspace_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "yoy_swing",
        metric,
        value,
        threshold,
        severity: Math.abs(value) / threshold,
        description,
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

/** Below-threshold current ratio - current liabilities exceeding current
 * assets is a direct liquidity-stress signal (the GDT advisory deck's
 * "technically liquidity-stressed" finding is exactly this check).
 * Resolves to no flags for any company without current_assets/
 * current_liabilities on file yet - null ratios are skipped, not
 * treated as zero. */
export function detectLiquidityRisk(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const minRatio = cfg.anomaly_thresholds.current_ratio_min;
  const flags: AnomalyFlag[] = [];

  for (const row of rows) {
    const ratio = row.ratios["current_ratio"];
    if (ratio == null || ratio >= minRatio) continue;
    flags.push({
      workspace_id: row.workspace_id,
      company_name: row.company_name,
      period_label: row.period_label,
      flag_type: "liquidity",
      metric: "current_ratio",
      value: ratio,
      threshold: minRatio,
      severity: minRatio / Math.max(ratio, 0.01),
      description:
        `current ratio of ${ratio.toFixed(2)}x is below the ${minRatio.toFixed(2)}x threshold \u2014 ` +
        `current liabilities exceed current assets, a liquidity-stress signal`,
    });
  }
  return flags;
}

/** Debt-to-equity past the sector's configured ceiling. */
export function detectLeverageRisk(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const maxDE = cfg.anomaly_thresholds.debt_equity_max;
  const flags: AnomalyFlag[] = [];

  for (const row of rows) {
    const de = row.ratios["debt_to_equity"];
    if (de == null || de <= maxDE) continue;
    flags.push({
      workspace_id: row.workspace_id,
      company_name: row.company_name,
      period_label: row.period_label,
      flag_type: "leverage",
      metric: "debt_to_equity",
      value: de,
      threshold: maxDE,
      severity: de / maxDE,
      description:
        `debt-to-equity of ${de.toFixed(2)}x is past the configured ${maxDE.toFixed(2)}x threshold \u2014 ` +
        `leverage is elevated relative to the equity base`,
    });
  }
  return flags;
}

/** Inventory or receivable days past the sector's configured ceiling -
 * capital tied up in slow-moving stock or slow collections, the GDT/TSR
 * "excess WIP days" / "inventory explosion" style finding. Checked
 * independently per company/metric, so a company can trip one, both, or
 * neither. */
export function detectWorkingCapitalStress(rows: PeerRow[], sector: string): AnomalyFlag[] {
  const cfg = getSectorConfig(sector);
  const maxInvDays = cfg.anomaly_thresholds.inventory_days_max;
  const maxRecDays = cfg.anomaly_thresholds.receivable_days_max;
  const flags: AnomalyFlag[] = [];

  for (const row of rows) {
    const invDays = row.ratios["inventory_days"];
    if (invDays != null && invDays > maxInvDays) {
      flags.push({
        workspace_id: row.workspace_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "working_capital",
        metric: "inventory_days",
        value: invDays,
        threshold: maxInvDays,
        severity: invDays / maxInvDays,
        description:
          `inventory days of ${invDays.toFixed(0)} exceed the configured ${maxInvDays.toFixed(0)}-day ` +
          `threshold \u2014 capital may be tied up in slow-moving stock`,
      });
    }
    const recDays = row.ratios["receivable_days"];
    if (recDays != null && recDays > maxRecDays) {
      flags.push({
        workspace_id: row.workspace_id,
        company_name: row.company_name,
        period_label: row.period_label,
        flag_type: "working_capital",
        metric: "receivable_days",
        value: recDays,
        threshold: maxRecDays,
        severity: recDays / maxRecDays,
        description:
          `receivable days of ${recDays.toFixed(0)} exceed the configured ${maxRecDays.toFixed(0)}-day ` +
          `threshold \u2014 collections are slower than the configured norm`,
      });
    }
  }
  return flags;
}

export function runAllChecks(rows: PeerRow[], sector: string): AnomalyFlag[] {
  return [
    ...detectYoySwings(rows, sector),
    ...detectPeerRelativeOutliers(rows, sector),
    ...detectExceptionalItems(rows, sector),
    ...detectLiquidityRisk(rows, sector),
    ...detectLeverageRisk(rows, sector),
    ...detectWorkingCapitalStress(rows, sector),
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
'''

path.write_text(content, encoding="utf-8")
print(f"OK — wrote {len(content.encode('utf-8'))} bytes to {path}")