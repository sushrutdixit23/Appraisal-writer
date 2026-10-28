// Sentinel - data requests: the "send me your numbers" half of ingestion. An analyst opens a request for a company
// and a period; a link goes to the company's CA (or finance team), who uploads whatever their system exports -
// a Tally or Zoho trial balance, an Excel statement, a PDF. Nothing they send is trusted into the books: it is read
// by the same rules as any file and lands as a DRAFT an analyst reviews and imports.
//
// The link carries a random token. Only its SHA-256 is stored, so a leaked database cannot be replayed as upload
// links, and the plain token is shown exactly once, when the request is created.

import { createHash, randomBytes } from "node:crypto";

export { CADENCES, DEFAULT_DUE_DAYS, defaultDueDate, isOverdue, nextPeriodEnd } from "./requestDates";
export type { Cadence, RequestLike, RequestStatus } from "./requestDates";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token as it arrives in a URL: 32 url-safe characters. Anything else is rejected before touching the database. */
export const looksLikeToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{32}$/.test(s);

export const MAX_SUBMISSION_BYTES = 4 * 1024 * 1024;
