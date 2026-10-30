// Sentinel autofill - what an annual report's auditor's report says about the audit itself. A company's own numbers can be perfectly tidy while the auditor
// has qualified the opinion, drawn attention to a matter, or doubted that the company can carry on; those are the lines an analyst reads first and a ratio
// can never show. This reads the auditor's report out of the pages already read (no model, no guessing at figures): which opinion it gives, and the verbatim
// text of any qualification, emphasis-of-matter, going-concern or other-matter paragraph. It also lifts out the sentences that state a contingent-liability
// amount, as leads to check against the notes.
//
// What it will NOT do: say a report is clean when none was found (it says it found none), parse the contingent-liabilities table (the notes are prose in one
// report and a table in the next), or read promoter pledges (those are in the quarterly shareholding-pattern filing, not the annual report).

import type { PdfPage } from "../extraction";

export type CheckSeverity = "high" | "medium" | "info";
export type AnnualCheck = { id: string; severity: CheckSeverity; title: string; detail: string; page: number | null };
export type Opinion = "unmodified" | "qualified" | "adverse" | "disclaimer" | "unknown";
export type AnnualReportChecks = { opinion: Opinion; findings: AnnualCheck[]; report_pages: number[]; contingent: { sentence: string; page: number }[] };

const REPORT_START = /Report on the Audit of the\s+(?:(Standalone|Consolidated)\s+)?Financial Statements/i;
const MAX_REPORT_PAGES = 14;
const MAX_DETAIL = 1500;

/** Headings that open a section of the auditor's report, as they print on a line of their own. */
const HEADINGS = [
  "Opinion", "Qualified Opinion", "Adverse Opinion", "Disclaimer of Opinion",
  "Basis for Opinion", "Basis for Qualified Opinion", "Basis for Adverse Opinion", "Basis for Disclaimer of Opinion",
  "Emphasis of Matter", "Emphasis of Matters", "Material Uncertainty Related to Going Concern",
  "Key Audit Matters", "Other Matter", "Other Matters",
];
const HEADING_SET = new Map(HEADINGS.map((h) => [h.toLowerCase(), h]));
// A line that opens a later part of the report ends whatever section came before it.
const SECTION_END = /^(Information Other than|Responsibilit(?:y|ies) of Management|Auditor.s Responsibilit|Report on Other Legal|Annexure\b)/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string) => (s.length <= MAX_DETAIL ? s : `${s.slice(0, s.lastIndexOf(" ", MAX_DETAIL)).trim()} [... truncated]`);

type Section = { heading: string; body: string; page: number };

/** The report's pages: from one that opens it to the page before an annexure, at most MAX_REPORT_PAGES. A file can hold two reports (standalone and consolidated). */
function reportPages(pages: PdfPage[]): { page: PdfPage; scope: string | null }[] {
  const sorted = [...pages].sort((a, b) => a.num - b.num);
  const out: { page: PdfPage; scope: string | null }[] = [];
  let open = 0;
  let scope: string | null = null;
  for (const p of sorted) {
    const start = REPORT_START.exec(p.text);
    if (start) { open = MAX_REPORT_PAGES; scope = start[1]?.toLowerCase() ?? null; }
    if (open <= 0) continue;
    if (!start && /^\s*Annexure\s+[AB]\b/im.test(p.text.slice(0, 600))) { open = 0; continue; }
    out.push({ page: p, scope });
    open--;
  }
  return out;
}

function sectionsOf(group: { page: PdfPage }[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const { page } of group) {
    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      const heading = HEADING_SET.get(line.replace(/[.:]+$/, "").toLowerCase());
      if (heading && line.length < 80) { current = { heading, body: "", page: page.num }; sections.push(current); continue; }
      if (current && SECTION_END.test(line)) { current = null; continue; }
      if (current && line) current.body += `${line} `;
    }
  }
  return sections.map((s) => ({ ...s, body: clean(s.body) }));
}

// Words that open a sentence about a contingent liability's size; the standard policy wording ("are disclosed", "possible obligation") never has an amount.
const AMOUNT = /(?:₹|Rs\.?|INR|\bH|`)\s?[\d,]+(?:\.\d+)?\s*(?:crore|crores|lakh|lakhs|million)/i;
const POLICY = /\b(are disclosed|is disclosed|possible obligation|confirmed only by|is not recognised|not probable)\b/i;

export function contingentLeads(pages: PdfPage[], limit = 6): { sentence: string; page: number }[] {
  const out: { sentence: string; page: number }[] = [];
  const seen = new Set<string>();
  for (const p of [...pages].sort((a, b) => a.num - b.num)) {
    const text = clean(p.text);
    for (const sentence of text.split(/(?<=[a-z0-9)])\.\s+(?=[A-Z])/)) {
      if (!/\bcontingent liabilit(?:y|ies)\b/i.test(sentence) || !AMOUNT.test(sentence) || POLICY.test(sentence)) continue;
      const s = sentence.length > 420 ? `${sentence.slice(0, 420).trim()} ...` : sentence.trim();
      const key = s.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sentence: s, page: p.num });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The auditor's-report checks for a set of pages, or null when the pages hold no auditor's report at all (the caller then says nothing about it). */
export function runAnnualReportChecks(pages: PdfPage[]): AnnualReportChecks | null {
  const group = reportPages(pages);
  const contingent = contingentLeads(pages);
  if (group.length === 0) return contingent.length > 0 ? { opinion: "unknown", findings: [], report_pages: [], contingent } : null;

  const findings: AnnualCheck[] = [];
  const sections = sectionsOf(group);
  const has = (h: string) => sections.some((s) => s.heading === h);
  const opinion: Opinion = has("Basis for Adverse Opinion") || has("Adverse Opinion") ? "adverse"
    : has("Basis for Disclaimer of Opinion") || has("Disclaimer of Opinion") ? "disclaimer"
    : has("Basis for Qualified Opinion") || has("Qualified Opinion") ? "qualified"
    : sections.some((s) => s.heading === "Opinion" && /true and fair view/i.test(s.body)) ? "unmodified" : "unknown";

  const add = (id: string, severity: CheckSeverity, title: string, s: Section) => findings.push({ id, severity, title, detail: cut(s.body), page: s.page });
  const seen = new Set<string>();
  for (const s of sections) {
    const key = `${s.heading}|${s.body.slice(0, 80)}`;
    if (seen.has(key) || !s.body) continue;
    seen.add(key);
    if (s.heading === "Basis for Qualified Opinion") add("qualified", "high", "The auditor has qualified the opinion", s);
    else if (s.heading === "Basis for Adverse Opinion") add("adverse", "high", "The auditor has given an adverse opinion", s);
    else if (s.heading === "Basis for Disclaimer of Opinion") add("disclaimer", "high", "The auditor has disclaimed an opinion", s);
    else if (s.heading === "Material Uncertainty Related to Going Concern") add("going_concern", "high", "The auditor reports a material uncertainty about the company continuing as a going concern", s);
    else if (s.heading === "Emphasis of Matter" || s.heading === "Emphasis of Matters") add("emphasis", "medium", "The auditor draws attention to a matter (emphasis of matter)", s);
    else if (s.heading === "Other Matter" || s.heading === "Other Matters") add("other_matter", "info", "Other matter noted by the auditor", s);
  }
  if (opinion === "unmodified" && findings.length === 0) findings.push({ id: "unmodified", severity: "info", title: "The auditor's opinion is unmodified, with no emphasis-of-matter or going-concern paragraph", detail: "The report gives an opinion that the statements give a true and fair view, and none of the headings that signal a qualification, an emphasis of matter or a going-concern uncertainty appears.", page: group[0].page.num });
  for (const c of contingent) findings.push({ id: "contingent", severity: "info", title: "A contingent liability is stated with an amount", detail: c.sentence, page: c.page });
  return { opinion, findings, report_pages: group.map((g) => g.page.num), contingent };
}

/** One line for the import preview. */
export function summariseChecks(c: AnnualReportChecks): string {
  const high = c.findings.filter((f) => f.severity === "high");
  if (high.length > 0) return `Auditor's report: ${high.map((f) => f.title.toLowerCase()).join("; ")}. Read it before relying on these figures.`;
  const medium = c.findings.filter((f) => f.severity === "medium").length;
  if (c.opinion === "unmodified") return medium > 0 ? "Auditor's report: unmodified opinion, with an emphasis-of-matter paragraph worth reading." : "Auditor's report: unmodified opinion, no emphasis of matter or going-concern paragraph.";
  return "An auditor's report was found but its opinion could not be classified; read it.";
}

// ---- saving with a statement ----------------------------------------------------------------------------------------------

/** The checks as text for the statement row (a column holds at most 8,000 characters): details are shortened, then the contingent leads dropped, until it fits. */
export function serialiseChecks(c: AnnualReportChecks, max = 8000): string {
  const make = (detailCap: number, withLeads: boolean) =>
    JSON.stringify({ o: c.opinion, f: c.findings.filter((f) => withLeads || f.id !== "contingent").map((f) => ({ id: f.id, s: f.severity, t: f.title, d: f.detail.length > detailCap ? `${f.detail.slice(0, detailCap).trim()} ...` : f.detail, p: f.page })) });
  for (const [cap, leads] of [[MAX_DETAIL, true], [700, true], [400, true], [400, false], [200, false]] as [number, boolean][]) {
    const s = make(cap, leads);
    if (s.length <= max) return s;
  }
  return make(80, false).slice(0, max);
}

export type StoredChecks = { opinion: Opinion; findings: AnnualCheck[] };

/** What was saved, or null when the column is empty or not what this wrote. */
export function parseChecks(text: string | null | undefined): StoredChecks | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as { o?: unknown; f?: unknown };
    if (!Array.isArray(o.f) || typeof o.o !== "string") return null;
    const findings = (o.f as Record<string, unknown>[]).filter((x) => typeof x.id === "string" && typeof x.t === "string").map((x) => ({
      id: String(x.id), severity: (["high", "medium", "info"].includes(String(x.s)) ? x.s : "info") as CheckSeverity, title: String(x.t), detail: String(x.d ?? ""), page: typeof x.p === "number" ? x.p : null,
    }));
    return { opinion: (["unmodified", "qualified", "adverse", "disclaimer", "unknown"].includes(o.o) ? o.o : "unknown") as Opinion, findings };
  } catch {
    return null;
  }
}
