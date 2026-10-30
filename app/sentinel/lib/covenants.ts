// Sentinel - covenant tracker. A lender's covenant is a limit on a ratio ("net debt to EBITDA no higher than 3.0x", "interest cover no lower than 2.5x").
// The analyst enters the limit once; Sentinel computes the ratio from the latest annual statement on file and says how much room is left.
//
// Two honest limits, stated on the page as well: (1) the ratio is computed from the filed annual statement, and a facility agreement often defines its
// terms differently (adjusted EBITDA, leases inside debt, a rolling twelve months, a half-yearly test) so the figure is a close read, not the lender's
// compliance certificate; (2) only annual statements are tested - a quarter carries no balance sheet, so a leverage test cannot be run on it.

import { interestCover } from "./ratios";
import type { FinancialStatement, Workspace } from "./types";

export const COVENANT_METRICS = ["net_debt_ebitda", "debt_equity", "interest_cover", "current_ratio"] as const;
export type CovenantMetric = (typeof COVENANT_METRICS)[number];
export type Comparator = "max" | "min";

export const METRIC_INFO: Record<CovenantMetric, { label: string; comparator: Comparator; formula: string }> = {
  net_debt_ebitda: { label: "Net debt / EBITDA", comparator: "max", formula: "(total debt - cash and equivalents) / EBITDA" },
  debt_equity: { label: "Debt / equity", comparator: "max", formula: "total debt / total equity" },
  interest_cover: { label: "Interest cover", comparator: "min", formula: "(profit before tax + finance costs) / finance costs" },
  current_ratio: { label: "Current ratio", comparator: "min", formula: "current assets / current liabilities" },
};

export type CovenantRow = {
  id?: string;
  workspace_id?: string;
  name: string;
  metric: CovenantMetric;
  comparator: Comparator;
  limit_value: number;
  next_test_date?: string | null;
  notes?: string | null;
};

/** Less room than this on the limit reads as "tight". A starting assumption, not a market standard. */
export const TIGHT_HEADROOM = 0.15;
/** A test date this close is listed in the digest even when the covenant is comfortable. */
export const TEST_SOON_DAYS = 30;

export type CovenantStatus = "ok" | "tight" | "breach" | "unknown";

export type CovenantResult = {
  covenant: CovenantRow;
  status: CovenantStatus;
  /** The ratio as computed; null when it cannot be (see `reason`). Negative net debt / EBITDA means net cash. */
  value: number | null;
  period_label: string | null;
  /** How far the ratio can move toward the limit before it is breached, as a fraction of the limit (max) or of the ratio (min). Negative once breached. */
  headroom: number | null;
  /** For a leverage covenant: the fall in EBITDA, as a fraction, that would take the ratio to the limit. Null when it does not apply. */
  ebitda_cushion: number | null;
  /** Days from `today` to the next test date; negative once it has passed. Null with no date. */
  days_to_test: number | null;
  /** One plain sentence: what the figure is, and why there is none. */
  reason: string;
};

const statementFor = (workspace: Workspace | undefined, statements: FinancialStatement[], workspaceId: string): FinancialStatement | null => {
  const years = statements.filter((s) => s.workspace_id === workspaceId && s.period_type === "FY");
  const preferred = workspace ? years.filter((s) => s.basis === workspace.comparison_basis) : [];
  const pool = preferred.length > 0 ? preferred : years;
  return [...pool].sort((a, b) => b.period_end_date.localeCompare(a.period_end_date))[0] ?? null;
};

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

type Computed = { value: number | null; breach?: string; ebitdaCushion?: number | null; note?: string };

/** The ratio a covenant is tested on, from one annual statement. A ratio that would mislead (a loss-making EBITDA under a leverage cap, negative equity) is
 * reported as a breach with its reason rather than as a number that looks safe. */
function compute(metric: CovenantMetric, limit: number, s: FinancialStatement): Computed {
  switch (metric) {
    case "net_debt_ebitda": {
      if (s.total_debt == null || s.cash_and_equivalents == null || s.ebitda == null) return { value: null };
      const net = s.total_debt - s.cash_and_equivalents;
      if (net <= 0) return { value: s.ebitda > 0 ? net / s.ebitda : null, note: "The company holds more cash than debt (net cash)." };
      if (s.ebitda <= 0) return { value: null, breach: "EBITDA is not positive while there is net debt, so a leverage cap cannot be met." };
      const value = net / s.ebitda;
      return { value, ebitdaCushion: limit > 0 ? 1 - net / (limit * s.ebitda) : null };
    }
    case "debt_equity": {
      if (s.total_debt == null || s.total_equity == null) return { value: null };
      if (s.total_equity <= 0) return { value: null, breach: "Equity is zero or negative, so a debt-to-equity cap cannot be met." };
      return { value: s.total_debt / s.total_equity };
    }
    case "interest_cover": {
      const v = interestCover(s);
      return { value: v };
    }
    case "current_ratio": {
      if (s.current_assets == null || s.current_liabilities == null || s.current_liabilities <= 0) return { value: null };
      return { value: s.current_assets / s.current_liabilities };
    }
  }
}

const fmt = (v: number) => `${v.toFixed(2)}x`;

export function evaluateCovenant(covenant: CovenantRow, statements: FinancialStatement[], workspace: Workspace | undefined, today: string): CovenantResult {
  const days_to_test = covenant.next_test_date ? days(today, covenant.next_test_date) : null;
  const base = { covenant, value: null, period_label: null, headroom: null, ebitda_cushion: null, days_to_test };
  const stmt = statementFor(workspace, statements, covenant.workspace_id ?? workspace?.id ?? "");
  if (!stmt) return { ...base, status: "unknown", reason: "No annual statement is on file to test this against." };

  const c = compute(covenant.metric, covenant.limit_value, stmt);
  const label = METRIC_INFO[covenant.metric].label;
  if (c.breach) return { ...base, period_label: stmt.period_label, status: "breach", headroom: -1, reason: `${stmt.period_label}: ${c.breach}` };
  if (c.value == null) {
    return { ...base, period_label: stmt.period_label, status: "unknown", reason: `${label} cannot be computed from ${stmt.period_label}: an input is missing or the denominator is not positive.` };
  }

  const v = c.value;
  const limit = covenant.limit_value;
  let headroom: number;
  let breached: boolean;
  if (covenant.comparator === "max") {
    breached = v > limit;
    headroom = limit > 0 ? (limit - v) / limit : breached ? -1 : 1;
  } else {
    breached = v < limit;
    headroom = v > 0 ? (v - limit) / v : -1;
  }
  const status: CovenantStatus = breached ? "breach" : headroom < TIGHT_HEADROOM ? "tight" : "ok";
  const side = covenant.comparator === "max" ? "at most" : "at least";
  const room = breached ? `${Math.abs(headroom * 100).toFixed(0)}% past the limit` : `${(headroom * 100).toFixed(0)}% of room`;
  const reason = `${stmt.period_label} (${stmt.basis}): ${label} ${fmt(v)} against ${side} ${fmt(limit)} - ${room}.${c.note ? ` ${c.note}` : ""}`;
  return { ...base, period_label: stmt.period_label, value: v, status, headroom, ebitda_cushion: c.ebitdaCushion ?? null, reason };
}

export function evaluateAll(covenants: CovenantRow[], statements: FinancialStatement[], workspaces: Workspace[], today: string): CovenantResult[] {
  return covenants.map((c) => evaluateCovenant(c, statements, workspaces.find((w) => w.id === c.workspace_id), today));
}

const STATUS_RANK: Record<CovenantStatus, number> = { breach: 0, tight: 1, unknown: 2, ok: 3 };
/** Worst first, then the nearest test date. */
export function rankResults(results: CovenantResult[]): CovenantResult[] {
  return [...results].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.days_to_test ?? 1e9) - (b.days_to_test ?? 1e9) || a.covenant.name.localeCompare(b.covenant.name));
}

/** One line for a covenant that needs attention, or null when it is comfortable and no test is close. */
export function attentionLine(r: CovenantResult): string | null {
  const test = r.days_to_test == null ? "" : r.days_to_test < 0 ? ` Test date ${r.covenant.next_test_date} has passed.` : r.days_to_test <= TEST_SOON_DAYS ? ` Next test ${r.covenant.next_test_date} (${r.days_to_test} day${r.days_to_test === 1 ? "" : "s"}).` : "";
  if (r.status === "breach") return `${r.reason}${test}`;
  if (r.status === "tight") return `${r.reason}${r.ebitda_cushion != null ? ` EBITDA can fall ${(r.ebitda_cushion * 100).toFixed(0)}% before the limit is reached.` : ""}${test}`;
  if (r.status === "unknown") return test ? `${r.reason}${test}` : null;
  return test && r.days_to_test != null && r.days_to_test >= 0 && r.days_to_test <= TEST_SOON_DAYS ? `${r.reason}${test}` : null;
}

export function validateCovenant(input: Record<string, unknown>): { ok: true; row: Omit<CovenantRow, "id" | "workspace_id"> } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!name) return { ok: false, error: "Give the covenant a name, such as the lender or facility." };
  if (!(COVENANT_METRICS as readonly unknown[]).includes(input.metric)) return { ok: false, error: "Pick one of the ratios Sentinel can compute." };
  const metric = input.metric as CovenantMetric;
  const comparator = input.comparator === "max" || input.comparator === "min" ? input.comparator : METRIC_INFO[metric].comparator;
  const limit = typeof input.limit_value === "number" ? input.limit_value : NaN;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) return { ok: false, error: "The limit must be a positive number, such as 3 for 3.0x." };
  const date = input.next_test_date;
  if (date != null && date !== "" && !(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date)) {
    return { ok: false, error: "The next test date must be a real date as YYYY-MM-DD." };
  }
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) || null : null;
  return { ok: true, row: { name, metric, comparator, limit_value: limit, next_test_date: typeof date === "string" && date ? date : null, notes } };
}
