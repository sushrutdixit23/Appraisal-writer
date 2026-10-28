// Sentinel - decision memory. A reviewer who approved, reworded or rejected an investigation of this
// company in an earlier period has already answered part of today's question. Showing the model those
// decisions - and the reviewer's own notes - stops it re-litigating something the firm has settled
// ("rejected last year: the receivables jump was a one-off acquisition") and lets it notice a repeat.
//
// Only decided investigations count (approved, edited, rejected): pending ones are drafts nobody has
// judged, archived ones were withdrawn for reasons that may have nothing to do with correctness.

import type { AnomalyFlag } from "./types";

export type PriorInvestigation = {
  period_label: string;
  status: string;
  observation: Pick<AnomalyFlag, "flag_type" | "metric" | "description">[] | null;
  reviewer_notes: string | null;
  final_narrative: string | null;
  updated_at: string | null;
};

export const DECIDED_STATUSES = ["approved", "edited", "rejected"] as const;

const VERDICT: Record<string, string> = {
  approved: "APPROVED by the reviewer",
  edited: "KEPT by the reviewer (with edits)",
  rejected: "REJECTED by the reviewer",
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trim()}...` : s);

/** Earlier decisions as a prompt block, newest first, at most `limit` of them. Empty string when there is
 * nothing decided. Each entry says whether the same flag type recurs, since a repeat is the useful signal. */
export function renderDecisionMemory(prior: PriorInvestigation[], currentFlags: Pick<AnomalyFlag, "flag_type" | "metric">[], limit = 4): string {
  const currentKeys = new Set(currentFlags.map((f) => `${f.flag_type}|${f.metric}`));
  const decided = prior
    .filter((p) => (DECIDED_STATUSES as readonly string[]).includes(p.status))
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, limit);
  if (decided.length === 0) return "";
  const blocks = decided.map((p) => {
    const flags = p.observation ?? [];
    const repeats = flags.filter((f) => currentKeys.has(`${f.flag_type}|${f.metric}`)).map((f) => f.metric);
    const flagLine = flags.length > 0 ? flags.map((f) => f.metric).join(", ") : "no flags recorded";
    const lines = [`- ${p.period_label}: ${VERDICT[p.status] ?? p.status}. Flagged: ${flagLine}.`];
    if (repeats.length > 0) lines.push(`  The same flag recurs today: ${[...new Set(repeats)].join(", ")}.`);
    if (p.reviewer_notes) lines.push(`  Reviewer's note: "${clip(p.reviewer_notes, 300)}"`);
    else if (p.status !== "rejected" && p.final_narrative) lines.push(`  Reviewer's final wording: "${clip(p.final_narrative, 300)}"`);
    return lines.join("\n");
  });
  return (
    `\n\nThis company's earlier investigations that a reviewer has already decided (use them: do not re-argue a point a reviewer settled, ` +
    `and say so plainly if today's flag repeats one):\n${blocks.join("\n")}`
  );
}
