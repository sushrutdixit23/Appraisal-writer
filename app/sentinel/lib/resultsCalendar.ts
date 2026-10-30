// Sentinel - the results calendar. A listed company must publish quarterly results within 45 days of the quarter end and the
// audited annual results within 60 days of the year end (SEBI Listing Regulations, Regulation 33), so the date each company's
// next figures are due is knowable from its fiscal year alone. This turns that into a list an analyst checks every morning:
// whose results are due this week, whose are past the deadline and not yet imported, and whose are already on file.
//
// The deadline is a statutory last day, not an announced date: most companies report well before it, and a company that has
// not filed by then is itself worth a look. The tool cannot tell whether a company has filed, only whether the figures are
// in Sentinel, and the wording says so.

import { fiscalYearEnd, fiscalYearOf, periodForEndDate, quarterEnd } from "./autofill/periods";
import type { FinancialStatement, Workspace } from "./types";

export const QUARTER_WINDOW_DAYS = 45;
export const ANNUAL_WINDOW_DAYS = 60;
export const DUE_SOON_DAYS = 7;

export type ResultsStatus = "filed" | "open" | "due_soon" | "overdue";

export type ExpectedResults = {
  period_label: string;
  period_end_date: string;
  due_date: string;
  /** The last quarter of the year is reported together with the audited annual results, on the longer window. */
  year_end: boolean;
};

export type CalendarRow = ExpectedResults & {
  workspace_id: string;
  company_name: string;
  status: ResultsStatus;
  /** Whole days from today to the deadline; negative once it has passed. */
  days_left: number;
  /** Latest period on file for this company, by end date. */
  latest_on_file: string | null;
  next: ExpectedResults;
};

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / 86_400_000);

function expected(periodEnd: string, fyStartMonth: number): ExpectedResults {
  const [y, m] = periodEnd.split("-").map(Number);
  const fy = fiscalYearOf(y, m, fyStartMonth);
  const yearEnd = periodEnd === fiscalYearEnd(fy, fyStartMonth);
  return {
    period_label: periodForEndDate(periodEnd, "quarter", fyStartMonth).period_label,
    period_end_date: periodEnd,
    due_date: addDays(periodEnd, yearEnd ? ANNUAL_WINDOW_DAYS : QUARTER_WINDOW_DAYS),
    year_end: yearEnd,
  };
}

/** The quarter that ended most recently on or before `today`, and the one after it. */
export function resultsWindow(today: string, fyStartMonth: number): { latest: ExpectedResults; next: ExpectedResults } {
  const [y, m] = today.split("-").map(Number);
  const fy = fiscalYearOf(y, m, fyStartMonth);
  const ends: string[] = [];
  for (const f of [fy - 1, fy, fy + 1]) for (const n of [1, 2, 3, 4]) ends.push(quarterEnd(n, f, fyStartMonth));
  ends.sort();
  const idx = ends.findLastIndex((e) => e <= today);
  return { latest: expected(ends[idx], fyStartMonth), next: expected(ends[idx + 1], fyStartMonth) };
}

/** A company is on the calendar when it is the person's own AND listed (it has an NSE symbol or a BSE code): a private company has
 * no statutory results date. */
export const isCovered = (w: Pick<Workspace, "owner_id" | "is_public_reference" | "ticker" | "bse_code">, userId: string) =>
  w.owner_id === userId && !w.is_public_reference && !!(w.ticker || w.bse_code);

export function buildResultsCalendar(workspaces: Workspace[], statements: FinancialStatement[], today: string, userId: string): CalendarRow[] {
  const rows: CalendarRow[] = [];
  for (const w of workspaces) {
    if (!isCovered(w, userId)) continue;
    const { latest, next } = resultsWindow(today, w.fiscal_year_start_month || 4);
    const own = statements.filter((s) => s.workspace_id === w.id);
    const onFile = own.some((s) => s.period_end_date === latest.period_end_date);
    const daysLeft = daysBetween(today, latest.due_date);
    const status: ResultsStatus = onFile ? "filed" : daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "open";
    const newest = [...own].sort((a, b) => b.period_end_date.localeCompare(a.period_end_date))[0];
    rows.push({ ...latest, workspace_id: w.id, company_name: w.company_name, status, days_left: daysLeft, latest_on_file: newest?.period_label ?? null, next });
  }
  const rank: Record<ResultsStatus, number> = { overdue: 0, due_soon: 1, open: 2, filed: 3 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.due_date.localeCompare(b.due_date) || a.company_name.localeCompare(b.company_name));
}

export const STATUS_TEXT: Record<ResultsStatus, string> = {
  filed: "On file",
  open: "Not due yet",
  due_soon: "Due this week",
  overdue: "Past the deadline",
};

/** One sentence for a row, saying what is and is not known. */
export function describeRow(r: CalendarRow): string {
  if (r.status === "filed") return `${r.period_label} is on file in Sentinel.`;
  if (r.status === "overdue") return `${r.period_label} is not in Sentinel and the statutory deadline (${r.due_date}) passed ${-r.days_left} day${r.days_left === -1 ? "" : "s"} ago. Import the filing, or check whether the company filed late.`;
  return `${r.period_label} is due by ${r.due_date}, ${r.days_left === 0 ? "today" : `in ${r.days_left} day${r.days_left === 1 ? "" : "s"}`}. Nothing is imported yet.`;
}
