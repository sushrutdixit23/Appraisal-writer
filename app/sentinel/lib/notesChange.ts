// Sentinel - what changed in the notes since last year. The notes to an annual report are most informative as a change: a CARO answer that went from clean to adverse,
// a receivables tail that doubled, a related-party loan that appeared, an emphasis-of-matter paragraph that was not there a year ago. An analyst who renews a facility
// rarely has time to put two annual reports side by side; this does it for the findings Sentinel already stores with each year.
//
// The trap in any year-on-year comparison is "absent": a finding that is not in this year's list may be gone, or may simply not have been read. So every difference is
// classified against what each year's reader actually read:
//   new           in this year, not in last year, and the note WAS read last year
//   resolved      in last year, not in this year, and the note IS read this year
//   changed       in both, but the figure or the severity moved (the first figure in each title is shown)
//   unchanged     in both, same figure and severity (counted, not listed)
//   prior_unread  in this year, but last year's note was not read, so "new" cannot be said
//   now_unread    in last year, but this year's note was not read, so "resolved" cannot be said
//
// Only medium and high findings are compared; information items are context, not change. Clause-by-clause CARO results are compared when both years kept them
// (notes stored before they were kept cannot be compared that way, and the result says so rather than guessing).
//
// What it does not do: judge which changes matter (a reader's call), or compare figures the readers did not extract.

import { parseChecks, type StoredChecks } from "./autofill/annualChecks";
import { NOTE_KINDS, NOTE_LABEL, parseNotes, type AnnualNotes, type NoteKind } from "./autofill/notes";
import type { FinancialStatement, Workspace } from "./types";

export type ChangeStatus = "new" | "resolved" | "changed" | "prior_unread" | "now_unread";
export type ChangeItem = {
  status: ChangeStatus;
  source: "notes" | "auditor";
  /** "Receivables ageing" and so on, or "Auditor's report". */
  where: string;
  /** The finding as worded this year (or last year's, for resolved and now-unread items). */
  title: string;
  prior_title: string | null;
  severity: "high" | "medium";
  prior_severity: "high" | "medium" | null;
  /** The first figure in each title, when it has one, so "5.1 to 8.5" can be shown without parsing prose again. */
  figure: { from: number; to: number } | null;
  page: number | null;
  prior_page: number | null;
  /** The finding's own detail, with the words as printed. */
  detail: string;
  escalated: boolean;
};

export type ClauseChange = { clause: string; scope: string; from: "clear" | "adverse" | "read_it" | null; to: "clear" | "adverse" | "read_it" | null; page: number | null; kind: "worsened" | "improved" | "unclear" | "newly_read" | "no_longer_read" };

export type NotesChange = {
  current_label: string;
  prior_label: string;
  items: ChangeItem[];
  unchanged: number;
  clauses: ClauseChange[];
  /** True when both years kept clause-by-clause CARO results. False means the clause table is empty because it could not be built, not because nothing changed. */
  clauses_compared: boolean;
  opinion: { from: string; to: string } | null;
  /** Which notes were read in which year: the reason any "new" or "resolved" can or cannot be claimed. */
  coverage: { kind: string; label: string; read_prior: boolean; read_current: boolean }[];
  summary: Record<ChangeStatus, number> & { escalated: number };
};

export type NotesChangeResult =
  | { comparable: true; change: NotesChange }
  | { comparable: false; reason: string; current_label: string | null };

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;
/** A finding's identity across years: its id and its wording with every figure removed, so "8.5% of receivables" and "5.1% of receivables" are the same finding. */
export const findingKey = (id: string, title: string): string => `${id}|${title.toLowerCase().replace(/[+-]?\d[\d,]*(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim()}`;
const firstNumber = (t: string): number | null => { const m = NUMBER.exec(t); return m ? Number(m[0].replace(/,/g, "")) : null; };
const RANK = { high: 0, medium: 1 } as const;

type Flat = { key: string; source: "notes" | "auditor"; kind: string; where: string; id: string; title: string; severity: "high" | "medium"; detail: string; page: number | null };

function flatten(notes: AnnualNotes | null, checks: StoredChecks | null): { items: Flat[]; read: Record<string, boolean> } {
  const items: Flat[] = [];
  const read: Record<string, boolean> = {};
  for (const k of NOTE_KINDS) read[k] = !!notes && notes.read[k] > 0;
  read.auditor = !!checks && checks.opinion !== "unknown";
  for (const f of notes?.findings ?? []) if (f.severity !== "info") items.push({ key: findingKey(f.id, f.title), source: "notes", kind: f.note, where: NOTE_LABEL[f.note], id: f.id, title: f.title, severity: f.severity, detail: f.detail, page: f.page });
  for (const f of checks?.findings ?? []) if (f.severity !== "info") items.push({ key: findingKey(f.id, f.title), source: "auditor", kind: "auditor", where: "Auditor's report", id: f.id, title: f.title, severity: f.severity, detail: f.detail, page: f.page });
  return { items, read };
}

/** Two years' findings, matched one-to-one by key (a key can occur more than once, for example the same finding on the standalone and consolidated tables). */
function matchByKey(a: Flat[], b: Flat[]): { pairs: [Flat, Flat][]; onlyA: Flat[]; onlyB: Flat[] } {
  const pool = new Map<string, Flat[]>();
  for (const x of b) pool.set(x.key, [...(pool.get(x.key) ?? []), x]);
  const pairs: [Flat, Flat][] = [];
  const onlyA: Flat[] = [];
  for (const x of a) {
    const hit = pool.get(x.key)?.shift();
    if (hit) pairs.push([x, hit]); else onlyA.push(x);
  }
  return { pairs, onlyA, onlyB: [...pool.values()].flat() };
}

export function diffNotes(
  current: { label: string; notes: AnnualNotes | null; checks: StoredChecks | null },
  prior: { label: string; notes: AnnualNotes | null; checks: StoredChecks | null },
): NotesChange {
  const cur = flatten(current.notes, current.checks), pri = flatten(prior.notes, prior.checks);
  const { pairs, onlyA: onlyNow, onlyB: onlyBefore } = matchByKey(cur.items, pri.items);
  const items: ChangeItem[] = [];
  let unchanged = 0;

  for (const [now, before] of pairs) {
    const a = firstNumber(before.title), b = firstNumber(now.title);
    const moved = a != null && b != null && a !== b;
    const sev = now.severity !== before.severity;
    if (!moved && !sev) { unchanged++; continue; }
    items.push({ status: "changed", source: now.source, where: now.where, title: now.title, prior_title: before.title, severity: now.severity, prior_severity: before.severity, figure: moved ? { from: a!, to: b! } : null, page: now.page, prior_page: before.page, detail: now.detail, escalated: RANK[now.severity] < RANK[before.severity] || (moved && b! > a! && now.severity === "high") });
  }
  for (const now of onlyNow) {
    items.push({ status: pri.read[now.kind] ? "new" : "prior_unread", source: now.source, where: now.where, title: now.title, prior_title: null, severity: now.severity, prior_severity: null, figure: null, page: now.page, prior_page: null, detail: now.detail, escalated: false });
  }
  for (const before of onlyBefore) {
    items.push({ status: cur.read[before.kind] ? "resolved" : "now_unread", source: before.source, where: before.where, title: before.title, prior_title: before.title, severity: before.severity, prior_severity: before.severity, figure: null, page: null, prior_page: before.page, detail: before.detail, escalated: false });
  }
  const ORDER: Record<ChangeStatus, number> = { new: 0, changed: 1, resolved: 2, prior_unread: 3, now_unread: 4 };
  items.sort((x, y) => ORDER[x.status] - ORDER[y.status] || RANK[x.severity] - RANK[y.severity] || x.where.localeCompare(y.where));

  // CARO clause by clause, when both years kept the results.
  const cNow = current.notes?.caro_clauses, cBefore = prior.notes?.caro_clauses;
  const clauses: ClauseChange[] = [];
  const clausesCompared = !!cNow && !!cBefore;
  if (cNow && cBefore) {
    const keyOf = (c: { id: string; scope: string }) => `${c.id}|${c.scope}`;
    const before = new Map(cBefore.map((c) => [keyOf(c), c]));
    const now = new Map(cNow.map((c) => [keyOf(c), c]));
    for (const [k, c] of now) {
      const was = before.get(k);
      if (!was) { clauses.push({ clause: c.id, scope: c.scope, from: null, to: c.status, page: c.page, kind: "newly_read" }); continue; }
      if (was.status === c.status) continue;
      const kind: ClauseChange["kind"] = c.status === "adverse" ? "worsened" : was.status === "adverse" ? "improved" : "unclear";
      clauses.push({ clause: c.id, scope: c.scope, from: was.status, to: c.status, page: c.page, kind });
    }
    for (const [k, c] of before) if (!now.has(k)) clauses.push({ clause: c.id, scope: c.scope, from: c.status, to: null, page: null, kind: "no_longer_read" });
    const KORDER = { worsened: 0, improved: 1, unclear: 2, newly_read: 3, no_longer_read: 4 } as const;
    clauses.sort((x, y) => KORDER[x.kind] - KORDER[y.kind] || x.clause.localeCompare(y.clause));
  }

  const opinion = current.checks && prior.checks && current.checks.opinion !== "unknown" && prior.checks.opinion !== "unknown" && current.checks.opinion !== prior.checks.opinion ? { from: prior.checks.opinion, to: current.checks.opinion } : null;
  const coverage = [...NOTE_KINDS.map((k) => ({ kind: k as string, label: NOTE_LABEL[k as NoteKind] })), { kind: "auditor", label: "Auditor's report" }].map((c) => ({ ...c, read_prior: pri.read[c.kind], read_current: cur.read[c.kind] }));
  const summary = { new: 0, resolved: 0, changed: 0, prior_unread: 0, now_unread: 0, escalated: 0 };
  for (const i of items) { summary[i.status]++; if (i.escalated) summary.escalated++; }
  return { current_label: current.label, prior_label: prior.label, items, unchanged, clauses, clauses_compared: clausesCompared, opinion, coverage, summary };
}

const DAY = 86_400_000;

/** The latest annual year with notes or an auditor's report on file, against the year before it on the same basis. */
export function buildNotesChange(workspace: Workspace, statements: FinancialStatement[]): NotesChangeResult | null {
  const fy = statements.filter((s) => s.workspace_id === workspace.id && s.period_type === "FY");
  const onBasis = fy.filter((s) => s.basis === workspace.comparison_basis);
  const pool = (onBasis.length ? onBasis : fy).sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
  const has = (s: FinancialStatement) => !!parseNotes(s.annual_report_notes) || !!parseChecks(s.annual_report_checks);
  const latest = pool.find(has);
  if (!latest) return null;
  const t = Date.parse(`${latest.period_end_date}T00:00:00Z`);
  const prior = pool.find((s) => s !== latest && s.basis === latest.basis && Math.abs((t - Date.parse(`${s.period_end_date}T00:00:00Z`)) / DAY - 365) <= 31 && has(s));
  if (!prior) return { comparable: false, current_label: latest.period_label, reason: `Only ${latest.period_label} has annual-report notes on file for this basis. Import the previous year's annual report to see what changed.` };
  const side = (s: FinancialStatement) => ({ label: s.period_label, notes: parseNotes(s.annual_report_notes), checks: parseChecks(s.annual_report_checks) });
  return { comparable: true, change: diffNotes(side(latest), side(prior)) };
}
