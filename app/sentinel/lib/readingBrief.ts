// Sentinel - the reading brief: which pages of this company's latest annual report to open first, and why. The project page shows the auditor's report, the notes,
// the early-warning checklist and the year-on-year changes as separate cards; an analyst still has to work out where to start. This puts them in one order.
//
// It reads nothing and decides nothing new. It takes the findings the readers already produced and orders them by plain, stated rules:
//   3 points for a high finding, 1 for a medium one;
//   +2 if it is new this year (the same note was read last year and the finding was not there);
//   +1 if it got worse since last year (severity rose, or a high finding's figure rose).
// An early-warning checklist hit adds nothing: the checklist is computed from these same findings, so counting it would count one finding twice.
// Every reason is printed beside the item, so the order can be checked by eye. The points order the reading; they are not a measure of risk, and two companies'
// points are not comparable.
//
// What was NOT read is listed with equal weight: a brief that says "nothing to open" when half the notes were not recognised would be worse than no brief.

import { NOTE_KINDS, NOTE_LABEL, parseNotes } from "./autofill/notes";
import type { CovenantRow } from "./covenants";
import { buildEws } from "./ews";
import { buildNotesChange, findingKey } from "./notesChange";
import { findingsFor } from "./portfolio";
import type { FinancialStatement, Workspace } from "./types";

export type BriefItem = {
  rank: number;
  title: string;
  severity: "high" | "medium";
  source: "notes" | "auditor" | "covenant";
  page: number | null;
  /** The finding's own detail, with the words as printed. */
  detail: string;
  /** Why it sits where it does, in the order the points were given. */
  reasons: string[];
  points: number;
};

export type ReadingBrief = {
  period_label: string | null;
  items: BriefItem[];
  /** Findings at medium or high that did not make the list (the list is capped). */
  more: number;
  /** Notes and checks that could not be read for this company and year, each with what it means. */
  not_read: string[];
  headline: string;
};

export const BRIEF_LIMIT = 5;
export const BRIEF_POINTS = { high: 3, medium: 1, new_this_year: 2, worse: 1 } as const;
export const BRIEF_CAVEAT = "This orders the reading; it is not a measure of risk. A flag is a reason to read the page, not a conclusion about the company.";

export function buildReadingBrief(workspace: Workspace, statements: FinancialStatement[], covenants: CovenantRow[] = [], today: string = new Date().toISOString().slice(0, 10)): ReadingBrief | null {
  const annual = statements.filter((s) => s.workspace_id === workspace.id && s.period_type === "FY");
  if (annual.length === 0) return null;
  const { findings, notes_year } = findingsFor(workspace, statements, covenants, today);
  const change = buildNotesChange(workspace, statements);
  const ews = buildEws(workspace, statements);

  const changes = change && change.comparable ? change.change.items : [];
  const isNew = new Set(changes.filter((c) => c.status === "new").map((c) => c.title));
  const worse = new Set(changes.filter((c) => c.status === "changed" && c.escalated).map((c) => c.title));

  const seen = new Set<string>();
  const scored = findings.flatMap((f) => {
    const key = `${f.source}|${f.page}|${findingKey("", f.title)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const reasons = [f.severity === "high" ? "High severity" : "Medium severity"];
    let points: number = BRIEF_POINTS[f.severity];
    if (isNew.has(f.title)) { points += BRIEF_POINTS.new_this_year; reasons.push(`New this year (not in ${change && change.comparable ? change.change.prior_label : "last year's report"})`); }
    if (worse.has(f.title)) { points += BRIEF_POINTS.worse; reasons.push("Worse than last year"); }
    return [{ title: f.title, severity: f.severity, source: f.source, page: f.page, detail: f.detail, reasons, points }];
  });
  // Stable: equal points keep the order the readers gave (high before medium, then as found).
  const ordered = scored.map((x, i) => ({ x, i })).sort((a, b) => b.x.points - a.x.points || a.i - b.i).map(({ x }) => x);
  const items = ordered.slice(0, BRIEF_LIMIT).map((x, i) => ({ rank: i + 1, ...x }));

  const not_read: string[] = [];
  const latestNotes = annual.map((s) => ({ s, n: parseNotes(s.annual_report_notes) })).filter((x) => x.n).sort((a, b) => b.s.period_end_date.localeCompare(a.s.period_end_date))[0];
  if (!latestNotes) not_read.push("No annual report has been read for this company: the notes to the accounts are a blind spot, not clean.");
  else for (const k of NOTE_KINDS) if (latestNotes.n!.read[k] === 0) not_read.push(`${NOTE_LABEL[k]}: not recognised in the ${latestNotes.s.period_label} report.`);
  const unread = ews.items.filter((i) => i.status === "not_read" && i.group === "rbi_list");
  if (latestNotes && unread.length > 0) not_read.push(`${unread.length} early-warning indicator${unread.length === 1 ? "" : "s"} could not be tested (see the checklist for why).`);
  if (change && !change.comparable) not_read.push("No previous year to compare with: nothing can be called new or resolved.");

  const pages = items.filter((i) => i.page != null).length;
  const headline = items.length === 0
    ? (latestNotes ? `Nothing at medium or high in what was read of ${notes_year ?? "the latest report"}${not_read.length ? `, and ${not_read.length} thing${not_read.length === 1 ? " was" : "s were"} not read` : ""}.` : "Nothing can be said yet: no annual report has been read.")
    : `${items.length === 1 ? "One finding" : `${items.length} findings`} to read first${pages ? `, ${pages} with a page to open` : ""}${not_read.length ? `; ${not_read.length} thing${not_read.length === 1 ? " was" : "s were"} not read` : ""}.`;
  return { period_label: notes_year, items, more: Math.max(0, ordered.length - items.length), not_read, headline };
}
