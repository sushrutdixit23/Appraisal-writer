// Sentinel - the pure date rules behind data requests. Kept apart from requests.ts (which needs node:crypto for tokens)
// so browser code - the digest page - can import them without pulling a server-only module into the client bundle.

export type Cadence = "monthly" | "quarterly" | "annual";
export type RequestStatus = "open" | "submitted" | "closed";

export const CADENCES: readonly Cadence[] = ["monthly", "quarterly", "annual"];

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The period end after `periodEnd` for a cadence: month-ends step by 1, 3 or 12 months, always landing on a month's last day. */
export function nextPeriodEnd(periodEnd: string, cadence: Cadence): string {
  const [y, m] = periodEnd.split("-").map(Number);
  const step = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  const total = y * 12 + (m - 1) + step;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return isoOf(ny, nm, lastDay(ny, nm));
}

/** Days after the period end a submission is due, when the analyst does not say: a CA closes a month's books in about two weeks. */
export const DEFAULT_DUE_DAYS = 15;

export function defaultDueDate(periodEnd: string): string {
  const t = Date.parse(`${periodEnd}T00:00:00Z`) + DEFAULT_DUE_DAYS * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type RequestLike = { status: string; due_date: string | null; period_end_date: string };

/** Overdue: still waiting, and the due date (or the default one) is behind us. */
export function isOverdue(r: RequestLike, today: string): boolean {
  if (r.status !== "open") return false;
  return (r.due_date ?? defaultDueDate(r.period_end_date)) < today;
}


/** A real calendar date written YYYY-MM-DD. Date.parse alone rolls 2026-02-30 over to 2 March, so the date is rebuilt and compared. */
export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
