// Sentinel - estimates and variance. On results day an analyst's first question is "beat or miss?": the quarter against what was expected, line by line.
// Estimates are the person's own numbers or a consensus they paste in (Sentinel has no consensus feed and does not pretend to). They are stored in rupees
// crore so a later change of a project's reporting unit cannot leave them out by a factor of ten.

import { parseNumberInput } from "./fields";
import { parsePeriodHeader } from "./autofill/periods";
import { parseCsv } from "./autofill/sheet";
import type { ResultsBrief } from "./quarterly";

export const ESTIMATE_METRICS = ["revenue", "ebitda", "pbt", "pat"] as const;
export type EstimateMetric = (typeof ESTIMATE_METRICS)[number];
export const ESTIMATE_SOURCES = ["consensus", "own"] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

export const METRIC_LABEL: Record<EstimateMetric, string> = { revenue: "Revenue from operations", ebitda: "EBITDA", pbt: "Profit before tax", pat: "Profit after tax" };
/** Within this fraction of the estimate is "in line". Starting assumptions: profit lines are noisier than revenue. */
export const IN_LINE_TOLERANCE: Record<EstimateMetric, number> = { revenue: 0.01, ebitda: 0.02, pbt: 0.03, pat: 0.03 };

export type EstimateRow = {
  id?: string;
  period_end_date: string;
  metric: EstimateMetric;
  source: EstimateSource;
  source_label?: string | null;
  value_cr: number;
  as_of?: string | null;
};

export type Call = "beat" | "miss" | "in line";

/** Variance of an actual against an estimate, measured against the size of the estimate. Null when the estimate is zero. */
export const variance = (actual: number, estimate: number): number | null => (estimate === 0 ? null : (actual - estimate) / Math.abs(estimate));

export function callFor(metric: EstimateMetric, v: number | null): Call | null {
  if (v == null) return null;
  if (Math.abs(v) <= IN_LINE_TOLERANCE[metric]) return "in line";
  return v > 0 ? "beat" : "miss";
}

export type VarianceRow = {
  metric: EstimateMetric;
  label: string;
  actual: number | null;
  estimates: { source: EstimateSource; source_label: string | null; value: number; variance: number | null; call: Call | null; id?: string }[];
};

/** The brief's quarter against every estimate for that period end, one row per metric that has at least one. */
export function buildVariance(brief: ResultsBrief, estimates: EstimateRow[]): VarianceRow[] {
  const forPeriod = estimates.filter((e) => e.period_end_date === brief.period_end_date);
  const actualOf: Record<EstimateMetric, number | null> = {
    revenue: brief.lines.find((l) => l.key === "revenue")?.current ?? null,
    ebitda: brief.lines.find((l) => l.key === "ebitda")?.current ?? null,
    pbt: brief.lines.find((l) => l.key === "pbt")?.current ?? null,
    pat: brief.lines.find((l) => l.key === "pat")?.current ?? null,
  };
  const out: VarianceRow[] = [];
  for (const metric of ESTIMATE_METRICS) {
    const mine = forPeriod.filter((e) => e.metric === metric).sort((a, b) => a.source.localeCompare(b.source));
    if (mine.length === 0) continue;
    const actual = actualOf[metric];
    out.push({
      metric, label: METRIC_LABEL[metric], actual,
      estimates: mine.map((e) => {
        const v = actual == null ? null : variance(actual, e.value_cr);
        return { source: e.source, source_label: e.source_label ?? null, value: e.value_cr, variance: v, call: callFor(metric, v), id: e.id };
      }),
    });
  }
  return out;
}

/** Estimates for a quarter that is not on file yet: waiting for results. Grouped by period end, soonest first. */
export function waitingForResults(estimates: EstimateRow[], reportedEnds: Set<string>): { period_end_date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of estimates) if (!reportedEnds.has(e.period_end_date)) counts.set(e.period_end_date, (counts.get(e.period_end_date) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period_end_date, count]) => ({ period_end_date, count }));
}

// ---- CSV ------------------------------------------------------------------------------------------------------------------------

const METRIC_HEADERS: Record<string, EstimateMetric> = {
  revenue: "revenue", sales: "revenue", "revenue from operations": "revenue", "net sales": "revenue", "total revenue": "revenue",
  ebitda: "ebitda", "operating profit": "ebitda",
  pbt: "pbt", "profit before tax": "pbt",
  pat: "pat", "profit after tax": "pat", "net profit": "pat", "net income": "pat",
};
const norm = (h: string) => h.toLowerCase().replace(/[_()₹]/g, " ").replace(/\b(cr|crore|crores|rs|inr)\b/g, " ").replace(/\s+/g, " ").trim();

export type ParsedEstimates = { rows: EstimateRow[]; errors: string[] };

/** One row per period, one column per metric (values in rupees crore), plus an optional "source" column ("consensus" or "own") and a "source label"
 * column (the broker or service). The period may be a label ("Q2 FY27", "Sep-26") or a date. */
export function parseEstimatesCsv(text: string, fyStartMonth = 4, defaultSource: EstimateSource = "consensus"): ParsedEstimates {
  const grid = parseCsv(text);
  const errors: string[] = [];
  if (grid.length < 2) return { rows: [], errors: ["The file needs a header row and at least one row of estimates."] };
  const head = grid[0].map((h) => norm(h));
  const periodCol = head.findIndex((h) => /^(period|quarter|period end|period ending|date)$/.test(h));
  if (periodCol < 0) return { rows: [], errors: ['The first row needs a "period" column (Q2 FY27, Sep-26 or a date).'] };
  const metricCols = head.map((h, i) => ({ i, metric: METRIC_HEADERS[h] })).filter((c) => c.metric);
  if (metricCols.length === 0) return { rows: [], errors: ["No estimate columns found. Use revenue, EBITDA, PBT and PAT as column headings (values in rupees crore)."] };
  const sourceCol = head.findIndex((h) => h === "source");
  const labelCol = head.findIndex((h) => /^(source label|broker|provider|by)$/.test(h));
  const rows: EstimateRow[] = [];
  grid.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const rawPeriod = (r[periodCol] ?? "").trim();
    if (!rawPeriod && r.every((c) => !c.trim())) return;
    const period = parsePeriodHeader(rawPeriod, fyStartMonth);
    if (!period.period_end_date || period.unsupported) { errors.push(`Row ${line}: "${rawPeriod}" is not a period Sentinel can read.`); return; }
    const srcRaw = sourceCol >= 0 ? (r[sourceCol] ?? "").trim().toLowerCase() : "";
    const source: EstimateSource = srcRaw === "own" || srcRaw === "analyst" ? "own" : defaultSource;
    if (srcRaw && !["own", "analyst", "consensus", "street"].includes(srcRaw)) errors.push(`Row ${line}: source "${srcRaw}" is not "consensus" or "own"; read as ${defaultSource}.`);
    const label = labelCol >= 0 ? (r[labelCol] ?? "").trim().slice(0, 60) || null : null;
    for (const c of metricCols) {
      const cell = (r[c.i] ?? "").trim();
      if (!cell) continue;
      const p = parseNumberInput(cell);
      if (p.invalid || p.value == null) { errors.push(`Row ${line}: "${cell}" under ${head[c.i]} is not a number.`); continue; }
      rows.push({ period_end_date: period.period_end_date, metric: c.metric, source, source_label: label, value_cr: p.value });
    }
  });
  if (rows.length === 0 && errors.length === 0) errors.push("No estimates were found in the file.");
  return { rows, errors };
}
