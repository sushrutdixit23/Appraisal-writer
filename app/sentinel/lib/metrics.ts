// Sentinel - operating metrics: the measures that are not in the financial statements (attrition, utilisation,
// headcount, order book...), recorded per company, period and metric (table: sentinel_operating_metrics, see
// supabase/migrations/20261030000000_sentinel_operating_metrics.sql). A shared preset list keeps the keys the same
// across companies so peers can be compared; a company can also record a custom measure by name.

export type MetricKind = "percent" | "count" | "amount";

export type MetricPreset = {
  key: string;
  label: string;
  kind: MetricKind;
  /** Which way is better, for showing a movement; null when it is neither. */
  better: "higher" | "lower" | null;
  hint: string;
};

// "amount" figures are in the company's reporting unit, like its statements.
export const METRIC_PRESETS: MetricPreset[] = [
  { key: "attrition_pct", label: "Attrition (last twelve months)", kind: "percent", better: "lower", hint: "Percent of employees who left in the last twelve months" },
  { key: "utilisation_pct", label: "Utilisation", kind: "percent", better: "higher", hint: "Billable share of available hours, as the company defines it" },
  { key: "headcount", label: "Headcount", kind: "count", better: null, hint: "Employees at the end of the period" },
  { key: "order_book", label: "Order book", kind: "amount", better: "higher", hint: "Contracted revenue yet to be delivered" },
  { key: "deal_wins_tcv", label: "Deal wins (total contract value)", kind: "amount", better: "higher", hint: "Contract value signed in the period" },
  { key: "top_client_pct", label: "Largest client share of revenue", kind: "percent", better: "lower", hint: "Percent of revenue from the largest client" },
  { key: "top10_clients_pct", label: "Top ten clients share of revenue", kind: "percent", better: "lower", hint: "Percent of revenue from the ten largest clients" },
  { key: "offshore_pct", label: "Offshore share of revenue", kind: "percent", better: null, hint: "Percent of revenue delivered offshore" },
  { key: "cc_growth_pct", label: "Constant-currency revenue growth", kind: "percent", better: "higher", hint: "Growth excluding currency moves, as the company reports it" },
  { key: "fx_revenue_pct", label: "Revenue in foreign currency", kind: "percent", better: null, hint: "Percent of revenue billed outside rupees" },
];

export const presetFor = (key: string) => METRIC_PRESETS.find((p) => p.key === key) ?? null;
export const metricLabel = (key: string) => presetFor(key)?.label ?? key;

export type MetricRow = {
  id?: string;
  workspace_id?: string;
  period_label: string;
  metric: string;
  value: number;
  unit: string | null;
  source: string | null;
};

export type MetricInput = { period_label: string; metric: string; value: number; unit: string | null; source: string | null };

/** A request's metric, checked: a preset (value range checked by its kind) or a custom measure named in words. */
export function parseMetricInput(raw: unknown): { ok: true; row: MetricInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Missing the metric." };
  const r = raw as Record<string, unknown>;
  const period = typeof r.period_label === "string" ? r.period_label.trim() : "";
  if (!period || period.length > 40) return { ok: false, error: "Period label is required (40 characters at most)." };
  const metric = typeof r.metric === "string" ? r.metric.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (!metric || metric.length > 60 || /[\u0000-\u001f]/.test(metric)) return { ok: false, error: "Name the metric (60 characters at most)." };
  const value = typeof r.value === "number" ? r.value : typeof r.value === "string" && r.value.trim() !== "" ? Number(r.value.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(value)) return { ok: false, error: "The value must be a number." };
  const source = typeof r.source === "string" && r.source.trim() ? r.source.trim().slice(0, 200) : null;

  const preset = presetFor(metric);
  if (preset?.kind === "percent" && (value < 0 || value > 100)) return { ok: false, error: `${preset.label} is a percentage between 0 and 100.` };
  if (preset && preset.kind !== "percent" && value < 0) return { ok: false, error: `${preset.label} cannot be negative.` };
  const unit = preset ? (preset.kind === "percent" ? "%" : preset.kind === "count" ? "people" : "company unit") : null;
  return { ok: true, row: { period_label: period, metric, value, unit, source } };
}

export function formatMetricValue(row: Pick<MetricRow, "metric" | "value">): string {
  const kind = presetFor(row.metric)?.kind;
  const text = row.value.toLocaleString("en-IN", { maximumFractionDigits: kind === "percent" ? 1 : 2 });
  return kind === "percent" ? `${text}%` : text;
}

/** The recorded figures as lines for the narrative prompt, latest period of each metric. Empty when none are
 * recorded, so the prompt says nothing about operating measures rather than implying any. */
export function operatingContext(rows: MetricRow[]): string {
  if (rows.length === 0) return "";
  const latest = new Map<string, MetricRow>();
  // rows arrive in any order; periods are labels, so keep the last seen per metric after sorting by label
  for (const r of [...rows].sort((a, b) => a.period_label.localeCompare(b.period_label, "en", { numeric: true }))) latest.set(r.metric, r);
  const lines = [...latest.values()].map((r) => `  ${metricLabel(r.metric)} (${r.period_label}): ${formatMetricValue(r)}${r.source ? ` [source: ${r.source}]` : ""}`);
  return (
    "\n\nOperating figures on record for this company (not from the financial statements; any other operating " +
    "measure such as attrition, utilisation or order book is unknown and must not be assumed):\n" +
    lines.join("\n")
  );
}
