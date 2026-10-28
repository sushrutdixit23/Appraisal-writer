// Sentinel - discussion on an investigation. An analyst can send a colleague, a client or a CA a link that shows ONE
// investigation and lets them comment on it, with no account and no membership model: the link is the credential, it
// expires, and the analyst can revoke it. This is the pure half: validation, link state and the projection of an
// investigation down to what a reviewer may see. The routes live under /api/sentinel/review-links, /comments and /review.

import type { Investigation } from "./types";

export const MAX_COMMENT_CHARS = 2000;
export const MAX_LABEL_CHARS = 80;
export const MAX_COMMENTS_PER_THREAD = 300;
export const DEFAULT_LINK_DAYS = 14;
export const MAX_LINK_DAYS = 60;

export type Cleaned = { ok: true; text: string } | { ok: false; error: string };

/** A comment as typed: text only, trimmed, control characters removed, never longer than the cap (rejected, not cut, so a
 * person is not left believing a half sentence was posted). */
export function readComment(v: unknown): Cleaned {
  if (typeof v !== "string") return { ok: false, error: "Write a comment." };
  // eslint-disable-next-line no-control-regex
  const text = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!text) return { ok: false, error: "Write a comment." };
  if (text.length > MAX_COMMENT_CHARS) return { ok: false, error: `Comments are limited to ${MAX_COMMENT_CHARS} characters; this one is ${text.length}.` };
  return { ok: true, text };
}

/** A reviewer's name as they typed it; defaults to "Reviewer" so an anonymous link still produces a readable thread. */
export function readLabel(v: unknown): string {
  if (typeof v !== "string") return "Reviewer";
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_CHARS);
  return t || "Reviewer";
}

/** The expiry of a link opened `now`, in whole days, clamped to 1..MAX_LINK_DAYS; DEFAULT_LINK_DAYS when unspecified. */
export function linkExpiry(days: unknown, now: Date = new Date()): { expires_at: string; days: number } {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.min(MAX_LINK_DAYS, Math.max(1, Math.round(days))) : DEFAULT_LINK_DAYS;
  return { expires_at: new Date(now.getTime() + n * 86_400_000).toISOString(), days: n };
}

export type LinkState = "active" | "expired" | "revoked";
export function linkState(link: { expires_at: string; revoked_at?: string | null }, now: Date = new Date()): LinkState {
  if (link.revoked_at) return "revoked";
  return Date.parse(link.expires_at) <= now.getTime() ? "expired" : "active";
}

export type ReviewView = {
  company_name: string;
  period_label: string;
  status: string;
  confidence_score: number | null;
  narrative: string | null;
  flags: { metric: string; description: string }[];
  questions: string[];
  untraced_figures: number;
};

/** What a reviewer sees: the finding, not the working. Deliberately a whitelist - the analyst's private notes, the other
 * investigations, the statements and the model's cost are never part of it, however the row grows later. */
export function reviewView(inv: Pick<Investigation, "period_label" | "status" | "confidence_score" | "ai_narrative" | "final_narrative" | "observation" | "suggested_questions" | "grounding_warnings">, companyName: string): ReviewView {
  return {
    company_name: companyName,
    period_label: inv.period_label,
    status: inv.status,
    confidence_score: inv.confidence_score ?? null,
    narrative: inv.final_narrative ?? inv.ai_narrative ?? null,
    flags: (inv.observation ?? []).map((f) => ({ metric: f.metric, description: f.description })),
    questions: inv.suggested_questions ?? [],
    untraced_figures: inv.grounding_warnings?.length ?? 0,
  };
}
