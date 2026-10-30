// Sentinel autofill / notes - everything the notes to an annual report say that the statements do not: receivables ageing, the company's own ratio disclosure,
// the auditor's CARO answers, contingent liabilities, liability maturities and related-party transactions. Each reader is in its own file and works from the pages
// alone, with arithmetic (a row adds up, a variance follows from its figures) as its check. This puts them together, hands each the company's own figures where a
// finding needs scale (net worth, revenue), and stores the outcome compactly with the year.
//
// A finding always carries the page it came from and the words as printed. Coverage is stated as well: a report whose related-party note is a layout the reader does
// not handle says "not read", not "nothing found".

import type { PdfPage } from "../../extraction";
import type { FinancialStatement } from "../../types";
import { ageingFindings, readReceivablesAgeing, type NoteFinding } from "./ageing";
import { caroFindings, readCaro } from "./caro";
import { contingentFindings, readContingentLiabilities } from "./contingent";
import { maturityFindings, readMaturities } from "./maturity";
import { crossCheck, ratioFindings, readReportedRatios, type RatioId } from "./ratios";
import { readRelatedParties, relatedPartyFindings } from "./relatedParty";

export type NoteKind = "ageing" | "ratios" | "caro" | "contingent" | "maturity" | "related_parties";
export const NOTE_LABEL: Record<NoteKind, string> = {
  ageing: "Receivables ageing", ratios: "Ratios the company discloses", caro: "Auditor's CARO answers", contingent: "Contingent liabilities",
  maturity: "When borrowings fall due", related_parties: "Related-party transactions",
};
export const NOTE_KINDS = Object.keys(NOTE_LABEL) as NoteKind[];

export type NoteItem = NoteFinding & { note: NoteKind };
export type AnnualNotes = {
  findings: NoteItem[];
  /** How many tables, rows or clauses each reader found: zero means "not read", which is not the same as "nothing wrong". */
  read: Record<NoteKind, number>;
  /** The company's own ratio figures, as disclosed, kept for the cross-check and the reader. */
  ratios: { id: RatioId; current: number; previous: number; page: number; basis: string | null }[];
};

/** The company's own figures from the same filing, in the unit the notes are printed in. Everything is optional: a missing figure means a finding is not ranked, not that it is dropped. */
export type NotesContext = {
  net_worth?: number | null;
  revenue?: number | null;
  expenses?: number | null;
  statement?: Pick<FinancialStatement, "current_assets" | "current_liabilities" | "profit_after_tax" | "revenue_from_operations" | "basis"> | null;
};

const RANK = { high: 0, medium: 1, info: 2 } as const;

export function readAnnualNotes(pages: PdfPage[], ctx: NotesContext = {}): AnnualNotes {
  const ageing = readReceivablesAgeing(pages);
  const ratios = readReportedRatios(pages);
  const caro = readCaro(pages);
  const contingent = readContingentLiabilities(pages);
  const maturity = readMaturities(pages);
  const rpt = readRelatedParties(pages);

  const tag = (note: NoteKind, fs: NoteFinding[]): NoteItem[] => fs.map((f) => ({ ...f, note }));
  const findings: NoteItem[] = [
    ...tag("ageing", ageingFindings(ageing)),
    ...tag("ratios", ratioFindings(ratios)),
    ...tag("caro", caroFindings(caro)),
    ...tag("contingent", contingentFindings(contingent, ctx.net_worth)),
    ...tag("maturity", maturityFindings(maturity)),
    ...tag("related_parties", relatedPartyFindings(rpt, { net_worth: ctx.net_worth, revenue: ctx.revenue, expenses: ctx.expenses })),
  ];
  // The company's own current ratio and net margin against what Sentinel computed from the statements it read: a disagreement is worth a look either way.
  if (ctx.statement) {
    for (const c of crossCheck(ratios, ctx.statement)) {
      if (c.agrees) continue;
      findings.push({ note: "ratios", id: `ratio_check_${c.id}`, severity: "medium", page: c.page, title: `Sentinel's ${c.id === "current_ratio" ? "current ratio" : "net margin"} does not match the company's own disclosure`, detail: `${c.detail} Either a statement line was misread or the company defines it differently: check both pages.` });
    }
  }
  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);

  return {
    findings,
    read: { ageing: ageing.length, ratios: ratios.length, caro: caro.reduce((n, r) => n + r.clauses.length, 0), contingent: contingent.length, maturity: maturity.reduce((n, t) => n + t.rows.length, 0), related_parties: rpt.reduce((n, t) => n + t.rows.length, 0) },
    ratios: ratios.map((r) => ({ id: r.id, current: r.current, previous: r.previous, page: r.page, basis: r.basis })),
  };
}

export const summarise = (n: AnnualNotes): string => {
  const high = n.findings.filter((f) => f.severity === "high").length, medium = n.findings.filter((f) => f.severity === "medium").length;
  const read = NOTE_KINDS.filter((k) => n.read[k] > 0).map((k) => NOTE_LABEL[k].toLowerCase());
  return `Notes read: ${read.length ? read.join(", ") : "none recognised"}. ${high} high and ${medium} medium finding${high + medium === 1 ? "" : "s"}, each with its page.`;
};

// ---- storage ----------------------------------------------------------------------------------------------------------------

const MAX_FINDINGS = 40;
const MAX_DETAIL = 420;

/** The notes as saved with the year: findings (title, detail, page), what each reader found, and the disclosed ratios. Bounded so it fits one text column. */
export function serialiseNotes(n: AnnualNotes, maxChars = 24000): string {
  const build = (limit: number) =>
    JSON.stringify({
      v: 1,
      r: n.read,
      f: n.findings.slice(0, limit).map((f) => ({ n: f.note, i: f.id, s: f.severity === "high" ? "h" : f.severity === "medium" ? "m" : "i", t: f.title.slice(0, 200), d: f.detail.slice(0, MAX_DETAIL), p: f.page })),
      q: n.ratios.slice(0, 30).map((r) => ({ i: r.id, c: r.current, v: r.previous, p: r.page, b: r.basis })),
    });
  let limit = MAX_FINDINGS;
  let s = build(limit);
  while (s.length > maxChars && limit > 1) { limit = Math.floor(limit * 0.7); s = build(limit); }
  return s;
}

export function parseNotes(raw: string | null | undefined): AnnualNotes | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { v?: number; r?: Record<string, number>; f?: { n: NoteKind; i: string; s: string; t: string; d: string; p: number }[]; q?: { i: RatioId; c: number; v: number; p: number; b: string | null }[] };
    if (j.v !== 1 || !Array.isArray(j.f)) return null;
    const read = Object.fromEntries(NOTE_KINDS.map((k) => [k, Number(j.r?.[k] ?? 0)])) as Record<NoteKind, number>;
    return {
      read,
      findings: j.f.filter((f) => NOTE_KINDS.includes(f.n)).map((f) => ({ note: f.n, id: String(f.i), severity: f.s === "h" ? "high" : f.s === "m" ? "medium" : "info", title: String(f.t), detail: String(f.d), page: Number(f.p) })),
      ratios: (j.q ?? []).map((r) => ({ id: r.i, current: r.c, previous: r.v, page: r.p, basis: r.b })),
    };
  } catch {
    return null;
  }
}

