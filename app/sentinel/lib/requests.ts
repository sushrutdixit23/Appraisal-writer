// Sentinel - data requests: the "send me your numbers" half of ingestion. An analyst opens a request for a company
// and a period; a link goes to the company's CA (or finance team), who uploads whatever their system exports -
// a Tally or Zoho trial balance, an Excel statement, a PDF. Nothing they send is trusted into the books: it is read
// by the same rules as any file and lands as a DRAFT an analyst reviews and imports.
//
// The link carries a random token. Only its SHA-256 is stored, so a leaked database cannot be replayed as upload
// links, and the plain token is shown exactly once, when the request is created.

import { createHash, randomBytes } from "node:crypto";

export type Cadence = "monthly" | "quarterly" | "annual";
export type RequestStatus = "open" | "submitted" | "closed";

export const CADENCES: readonly Cadence[] = ["monthly", "quarterly", "annual"];

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token as it arrives in a URL: 32 url-safe characters. Anything else is rejected before touching the database. */
export const looksLikeToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{32}$/.test(s);

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

export const MAX_SUBMISSION_BYTES = 4 * 1024 * 1024;
