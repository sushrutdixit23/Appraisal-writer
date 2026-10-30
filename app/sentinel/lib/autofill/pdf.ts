// Sentinel autofill - reading the statement pages of a filing without a model.
//
// What it does, in order:
//   1. picks the statement pages (extraction.ts scores every page) and the basis the company is compared on;
//   2. reads each page's column headers: which dates, and whether each column is a year, a quarter, a
//      nine-month or an "as at" balance;
//   3. reads every row: the printed label, then the figures that trail it, dropping a note-number column;
//   4. matches labels to fields (labels.ts), keeps the best line per field and sums the ones printed twice;
//   5. works out what is not printed (derive.ts) and says so;
//   6. builds one period per column, merged across statements by end date.
//
// It never invents a number: a field is either a printed figure, a stated arithmetic combination of printed
// figures (marked "derived"), or empty.

import { parseNumberInput } from "../fields";
import { extractKeyAuditMattersText, findKeyAuditMattersPages, selectStatementPages, type PdfPage } from "../extraction";
import { detectUnitInText } from "../units";
import { runAnnualReportChecks, summariseChecks } from "./annualChecks";
import type { NumericField } from "../fields";
import { readAnnualNotes, summarise as summariseNotes } from "./notes";
import { checkAndDowngrade, deriveFields, type Raw } from "./derive";
import { matchLabel, statementOfHeading, type StatementKind, type Target } from "./labels";
import { findDates, findFiscalYearRanges, periodForEndDate } from "./periods";
import { AutofillError, type AutofillOptions, type AutofillPeriod, type AutofillResult, type Confidence } from "./types";
import type { Basis, PeriodType } from "../types";

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

const AMOUNT = /^(?:\(-?\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?)$/;
const DASH = /^[-–—]$/;

export type Row = { label: string; tokens: string[]; text: string };

const cleanToken = (t: string) => t.replace(/−/g, "-").replace(/₹/g, "");

/** Split a line into its label and the figures that trail it. Figures are only read from the END of the
 * line, so a number inside the label ("refer note 35", "FY 2026") is never taken for an amount. */
export function splitRow(line: string): { label: string; tokens: string[] } | null {
  const parts = line.trim().split(/[\t ]+/).map(cleanToken).filter((p) => p.length > 0);
  const tokens: string[] = [];
  let i = parts.length;
  while (i > 0 && (AMOUNT.test(parts[i - 1]) || DASH.test(parts[i - 1]))) {
    tokens.unshift(parts[i - 1]);
    i--;
  }
  if (tokens.length === 0) return null;
  return { label: parts.slice(0, i).join(" "), tokens };
}

/** Lines whose label wraps onto the next line ("... other than micro enterprises and" / "small enterprises 450.00 420.00")
 * are joined, so the label is whole before it is matched. */
export function joinWrappedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const next = lines[i + 1]?.trim();
    if (next && !splitRow(line) && splitRow(next) && /^[a-z(&,]/.test(next) && line.length > 12 && !/[.:]$/.test(line)) {
      out.push(`${line} ${next}`);
      i++;
    } else {
      out.push(line);
    }
  }
  return out;
}

function tokenValue(token: string): number {
  if (DASH.test(token)) return 0; // a dash in a statement means nil
  return parseNumberInput(token).value ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------

export type ColKind = "year" | "quarter" | "nine" | "half" | "unknown";
export type Column = { end_date: string | null; kind: ColKind };

const KIND_PHRASES: [RegExp, ColKind][] = [
  [/(?:three|3)\s+months?\s+ended|quarter(?:ly)?\s+ended/gi, "quarter"],
  [/(?:nine|9)\s+months?\s+ended/gi, "nine"],
  [/(?:six|6)\s+months?\s+ended|half[\s-]*year(?:ly)?\s+ended/gi, "half"],
  [/(?:twelve|12)\s+months?\s+ended|(?:for\s+the\s+)?year\s+ended|year\s+to\s+date|as\s+at|as\s+on|as\s+of/gi, "year"],
];

/** The columns a page's header describes, left to right. A header can be one line or several, and name the
 * kind once for a group ("Quarter ended  31.12.25  30.09.25  31.12.24") or once per column. */
// How many columns each group header usually covers in a SEBI results layout: a quarter has three (this
// quarter, the previous one, the same quarter last year), a nine-month or half-year period two (this year and
// last), a full year one.
const GROUP_SIZE: Record<ColKind, number> = { quarter: 3, nine: 2, half: 2, year: 1, unknown: 1 };

export function readColumns(headerLines: string[], fyStartMonth = 4): Column[] {
  const text = headerLines.join("\n");
  const dates = [...findDates(text), ...findFiscalYearRanges(text, fyStartMonth)].sort((a, b) => a.index - b.index);
  if (dates.length === 0) return [];
  const phrases: { index: number; kind: ColKind }[] = [];
  for (const [re, kind] of KIND_PHRASES) for (const m of text.matchAll(re)) phrases.push({ index: m.index ?? 0, kind });
  phrases.sort((a, b) => a.index - b.index);

  const firstDate = dates[0].index;
  const allBefore = phrases.length > 0 && phrases.every((p) => p.index < firstDate);
  if (allBefore) {
    // One phrase per column, printed on a row above the dates.
    if (phrases.length === dates.length) return dates.map((d, i) => ({ end_date: d.iso, kind: phrases[i].kind }));
    // Group headers on their own row ("Quarter ended | Nine months ended | Year ended") above the date row.
    const sizes = phrases.map((p) => GROUP_SIZE[p.kind]);
    if (sizes.reduce((n, s) => n + s, 0) === dates.length) {
      const cols: Column[] = [];
      phrases.forEach((p, gi) => { for (let k = 0; k < sizes[gi]; k++) cols.push({ end_date: dates[cols.length].iso, kind: p.kind }); });
      return cols;
    }
    // Cannot place the groups: trust only the first one, for the columns it can cover.
    const first = phrases[0].kind;
    return dates.map((d, i) => ({ end_date: d.iso, kind: i < GROUP_SIZE[first] ? first : "unknown" }));
  }
  // A phrase applies to the dates that follow it, until the next phrase.
  let kind: ColKind = phrases.length === 0 ? "year" : "unknown";
  const cols: Column[] = [];
  let p = 0;
  for (const d of dates) {
    while (p < phrases.length && phrases[p].index < d.index) kind = phrases[p++].kind;
    cols.push({ end_date: d.iso, kind });
  }
  return cols;
}

// ---------------------------------------------------------------------------------------------
// One page
// ---------------------------------------------------------------------------------------------

type Candidate = { target: Target; weight: number; sum: boolean; row: Row; page: number; values: number[]; aligned: boolean };

type PageRead = {
  page: number;
  statement: StatementKind;
  columns: Column[];
  candidates: Candidate[];
  noteColumn: boolean;
  notes: string[];
};

function inferStatement(lines: string[]): StatementKind {
  const counts: Record<StatementKind, number> = { pl: 0, bs: 0, cf: 0 };
  for (const l of lines) {
    const row = splitRow(l);
    if (!row) continue;
    for (const kind of ["pl", "bs", "cf"] as StatementKind[]) if (matchLabel(row.label, kind)) counts[kind]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as StatementKind) ?? "pl";
}

function previousYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function readPage(page: PdfPage, previous: StatementKind | null, fyStart: number): PageRead {
  const rawLines = page.text.split(/\r?\n/);
  const lines = joinWrappedLines(rawLines);
  const statement = statementOfHeading(rawLines.slice(0, 12).join(" ")) ?? previous ?? inferStatement(lines);
  const notes: string[] = [];

  // The header is whatever sits between the title and the first line item. The title itself ("... for the year
  // ended 31 March 2026") repeats the first column's date, so it is only used if nothing else carries one.
  const header: string[] = [];
  const titles: string[] = [];
  for (const l of rawLines.slice(0, 40)) {
    const r = splitRow(l);
    if (r && matchLabel(r.label, statement)) break;
    (statementOfHeading(l) ? titles : header).push(l);
  }
  let columns = readColumns(header, fyStart);
  if (columns.length === 0) columns = readColumns(titles, fyStart);

  const rows: Row[] = [];
  for (const line of lines) {
    const r = splitRow(line);
    if (r && r.label.length > 1) rows.push({ label: r.label, tokens: r.tokens, text: line });
  }

  // A note-number column ("Revenue from operations  24  1,000.00  900.00") shows up as one extra small
  // integer in front of the figures. With the header giving the column count it is exact; without, it is
  // inferred from how many rows carry that extra integer.
  // A note reference is a small integer ("24") or a dotted one ("2.18", used by Infosys). A dotted figure is only ever read as a note
  // when its row has one token more than the columns, or the page's other rows show the pattern, so a genuine "12.50" amount is safe.
  const small = (t: string) => /^\d{1,3}$/.test(t) || /^\d{1,2}\.\d{1,2}$/.test(t) || /^\d{1,2},\d{1,2}$/.test(t); // the last: "2.1, 2.3" read by OCR as "21,23" - not a valid amount
  let noteColumn = false;
  const expected = columns.length;
  if (expected > 0) {
    const withExtra = rows.filter((r) => r.tokens.length === expected + 1 && small(r.tokens[0])).length;
    const exact = rows.filter((r) => r.tokens.length === expected).length;
    noteColumn = withExtra > 0 && withExtra >= exact * 0.4;
    // "As at March 31," over a bare "2026  2025" reads as ONE date, yet the rows carry a note number and two years of figures.
    if (!noteColumn && expected === 1) {
      const noteAndTwo = rows.filter((r) => r.tokens.length === 3 && small(r.tokens[0])).length;
      const two = rows.filter((r) => r.tokens.length === 2).length;
      noteColumn = noteAndTwo > 0 && noteAndTwo >= two * 0.4;
    }
  } else {
    const wide = rows.filter((r) => r.tokens.length >= 3);
    noteColumn = wide.length >= 3 && wide.filter((r) => small(r.tokens[0])).length / wide.length >= 0.6;
  }

  // One date for two columns of figures: a year statement that prints only "year ended 31 March 2026" above a
  // current and a previous-year column.
  const lengths = new Map<number, number>();
  for (const r of rows) {
    const n = noteColumn && r.tokens.length >= 3 && small(r.tokens[0]) ? r.tokens.length - 1 : r.tokens.length;
    if (n >= 2) lengths.set(n, (lengths.get(n) ?? 0) + 1);
  }
  const modal = [...lengths.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  if (columns.length === 1 && modal === 2 && columns[0].kind === "year" && columns[0].end_date) {
    columns = [...columns, { end_date: previousYear(columns[0].end_date), kind: "year" }];
    notes.push(`Page ${page.num} names one date but prints two columns; the second was read as the previous year.`);
  }

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const match = matchLabel(row.label, statement);
    if (!match) continue;
    let tokens = row.tokens;
    const cols = columns.length;
    if (noteColumn && tokens.length >= 2 && small(tokens[0]) && (cols === 0 || tokens.length === cols + 1)) tokens = tokens.slice(1);
    // "Trade payables 21": a heading that carries only its note number, with the figures on the lines below.
    else if (noteColumn && tokens.length === 1 && small(tokens[0]) && cols !== 1) tokens = [];
    if (tokens.length === 0) continue;
    candidates.push({
      target: match.target,
      weight: match.weight,
      sum: match.sum,
      row,
      page: page.num,
      values: tokens.map(tokenValue),
      aligned: cols === 0 || tokens.length === cols,
    });
  }
  return { page: page.num, statement, columns, candidates, noteColumn, notes };
}

// ---------------------------------------------------------------------------------------------
// The whole filing
// ---------------------------------------------------------------------------------------------

const sourceOf = (c: Candidate) => `p.${c.page} | ${c.row.label} | ${c.row.tokens.join("  ")}`;

function confidenceOf(c: Candidate): Confidence {
  if (!c.aligned) return "low";
  return c.weight >= 4 ? "high" : c.weight === 3 ? "medium" : "low";
}

/** Read a filing's statement pages into one or more periods. */
export function autofillFromPdfPages(pages: PdfPage[], opts: AutofillOptions = {}): AutofillResult {
  const fyStart = opts.fyStartMonth ?? 4;
  const selection = selectStatementPages(pages, { preferredBasis: opts.preferredBasis ?? null });
  if (!selection) {
    throw new AutofillError("No page of this file looks like a financial statement (profit and loss, balance sheet or cash flow).");
  }
  const notes: string[] = [...selection.notes];

  // Never read into a field - it is prose, not a figure - but worth a pointer: real red flags often
  // show up here before they ever become a number, and nothing else in this pipeline looks at the
  // audit report at all.
  const kamPages = findKeyAuditMattersPages(pages);
  const keyAuditMattersText = extractKeyAuditMattersText(pages, kamPages);
  const annualChecks = runAnnualReportChecks(pages);
  if (annualChecks && annualChecks.report_pages.length > 0) notes.push(summariseChecks(annualChecks));
  if (kamPages.length > 0) {
    notes.push(`The auditor's Key Audit Matters are on p.${kamPages.join(", ")} - worth reading before relying on this period.`);
  }

  // Read every statement page.
  const reads: PageRead[] = [];
  let previous: StatementKind | null = null;
  for (const num of selection.pages) {
    const page = pages.find((p) => p.num === num)!;
    const read = readPage(page, previous, fyStart);
    previous = read.statement;
    reads.push(read);
  }

  for (const r of reads) notes.push(...r.notes);

  // Which kind of period are we reading: years, or quarters?
  const wanted: PeriodType | null = opts.periodType ?? null;
  const hasQuarterPl = reads.some((r) => r.statement === "pl" && r.columns.some((c) => c.kind === "quarter"));
  const mode: "year" | "quarter" = wanted === "FY" ? "year" : wanted ? "quarter" : hasQuarterPl ? "quarter" : "year";

  const quarterDates = new Set(reads.filter((r) => r.statement === "pl").flatMap((r) => r.columns.filter((c) => c.kind === "quarter").map((c) => c.end_date)));
  const accepts = (c: Column): boolean =>
    mode === "year" ? c.kind === "year" || c.kind === "unknown" : c.kind === "quarter" || (c.kind === "year" && !!c.end_date && quarterDates.has(c.end_date));

  const skipped = new Set<string>();
  // period key -> target -> candidate hits (per column of that period)
  const byPeriod = new Map<string, { end_date: string | null; kind: ColKind; raw: Map<Target, { cand: Candidate; col: number }[]> }>();
  const order: string[] = [];

  for (const read of reads) {
    const columns: Column[] = read.columns.length > 0 ? read.columns : inferColumns(read);
    columns.forEach((col, ci) => {
      if (!accepts(col)) {
        if (col.kind === "nine" || col.kind === "half") skipped.add(col.kind === "nine" ? "nine-month" : "half-year");
        return;
      }
      const key = col.end_date ?? `col${ci}`;
      if (!byPeriod.has(key)) {
        byPeriod.set(key, { end_date: col.end_date, kind: col.kind, raw: new Map() });
        order.push(key);
      }
      const slot = byPeriod.get(key)!;
      for (const cand of read.candidates) {
        if (ci >= cand.values.length) continue;
        const list = slot.raw.get(cand.target) ?? [];
        list.push({ cand, col: ci });
        slot.raw.set(cand.target, list);
      }
    });
  }
  if (skipped.size > 0) notes.push(`Skipped ${[...skipped].join(" and ")} columns: Sentinel stores full years and single quarters.`);
  if (byPeriod.size === 0) {
    throw new AutofillError("The statement pages were found but their columns could not be read. Enter the figures by hand or use a spreadsheet.");
  }

  const basisVotes = new Map<Basis, number>();
  for (const b of Object.values(selection.basisByPage)) if (b) basisVotes.set(b, (basisVotes.get(b) ?? 0) + 1);
  const pageBasis = [...basisVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const basis: Basis | null = pageBasis ?? opts.preferredBasis ?? null;

  const periods: AutofillPeriod[] = [];
  for (const key of order) {
    const slot = byPeriod.get(key)!;
    const raw: Raw = {};
    for (const [target, hits] of slot.raw) {
      const pick = (hs: typeof hits) => hs.reduce((best, h) => (h.cand.weight > best.cand.weight ? h : best), hs[0]);
      if (hits[0].cand.sum) {
        const total = hits.reduce((n, h) => n + h.cand.values[h.col], 0);
        raw[target] = { value: round2(total), source: hits.map((h) => sourceOf(h.cand)).join(" ; "), confidence: "low" };
      } else {
        const best = pick(hits);
        raw[target] = { value: best.cand.values[best.col], source: sourceOf(best.cand), confidence: confidenceOf(best.cand) };
      }
    }
    const { fields, notes: dnotes } = deriveFields(raw);
    const issues = checkAndDowngrade(fields);

    const label = slot.end_date ? periodForEndDate(slot.end_date, mode === "quarter" ? "quarter" : "year", fyStart) : null;
    const pnotes = [...dnotes];
    if (!slot.end_date) pnotes.push("The column's date could not be read; set the period label and end date yourself.");
    periods.push({
      key,
      period_type: label?.period_type ?? (opts.periodType ?? null),
      period_label: label?.period_label ?? null,
      period_end_date: label?.period_end_date ?? null,
      basis,
      fields,
      notes: pnotes,
      issues,
    });
  }
  periods.sort((a, b) => (b.period_end_date ?? "").localeCompare(a.period_end_date ?? ""));

  // The notes to the accounts (ageing, CARO, ratios, contingent liabilities, maturities, related parties), with the filing's own latest-year figures for scale.
  // Only an annual report has them; a results announcement finds none and the field is null.
  const year = periods.find((p) => p.period_type === "FY");
  const v = (k: NumericField) => year?.fields[k]?.value ?? null;
  const annualNotes = readAnnualNotes(pages, {
    net_worth: v("total_equity"), revenue: v("revenue_from_operations"), expenses: v("total_expenses"),
    statement: year ? { basis: year.basis ?? "consolidated", current_assets: v("current_assets"), current_liabilities: v("current_liabilities"), profit_after_tax: v("profit_after_tax") ?? 0, revenue_from_operations: v("revenue_from_operations") ?? 0 } : null,
  });
  const anyNotes = Object.values(annualNotes.read).some((n) => n > 0);
  if (anyNotes) notes.push(summariseNotes(annualNotes));

  // Periods that found almost nothing are usually a comparative column of a statement that only prints one year.
  const unit = selection.unit ?? detectUnitInText(selection.text);
  return {
    kind: "pdf",
    unit: unit
      ? { unit: unit.unit, source: "page", evidence: unit.evidence, ambiguous: unit.ambiguous }
      : { unit: null, source: "none", evidence: null, ambiguous: false },
    periods,
    notes,
    pages_used: selection.pages,
    layout: null,
    source_file: opts.sourceFile ?? "uploaded.pdf",
    key_audit_matters_text: keyAuditMattersText,
    annual_report_checks: annualChecks,
    annual_report_notes: anyNotes ? annualNotes : null,
  };
}

/** A page with no readable header: the columns are however many figures the rows carry (the most common count),
 * and nothing is known about what they cover. */
function inferColumns(read: PageRead): Column[] {
  const counts = new Map<number, number>();
  for (const c of read.candidates) counts.set(c.values.length, (counts.get(c.values.length) ?? 0) + 1);
  const n = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  return Array.from({ length: n }, () => ({ end_date: null, kind: "unknown" as ColKind }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

