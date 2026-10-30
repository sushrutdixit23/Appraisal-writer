// Sentinel autofill / notes - the trade-receivables ageing table. Schedule III makes every company print how much of its receivables is not yet due or
// has been outstanding for under six months, six months to a year, one to two years, two to three years and over three years, split into undisputed and
// disputed, good and credit impaired. A receivable-days ratio hides all of that: the same ratio can be a clean book or a book with a long tail nobody collects.
//
// Layouts differ (TCS prints one table per year, Infosys puts last year's row under each row, Tech Mahindra prints it in [brackets], Wipro adds a currency
// glyph the PDF font turns into "I"), so this does not rely on a layout. It finds figure rows of six or seven numbers where the last is the total, and the
// check that makes a row trustworthy is arithmetic: the buckets must add up to that total. A row that does not add up is dropped, never repaired, and the
// table says how many rows passed. Every table carries its page and the rows exactly as printed.

import type { PdfPage } from "../../extraction";
import { parseRow, type Row } from "./numeric";

export const BUCKETS_7 = ["Not due", "Under 6 months", "6 months - 1 year", "1 - 2 years", "2 - 3 years", "Over 3 years"] as const;
export const BUCKETS_6 = BUCKETS_7.slice(1) as readonly string[];

export type AgeingRow = {
  label: string;
  /** "good" (considered good), "impaired" (credit impaired / significant increase in credit risk), "other" when the label says neither. */
  quality: "good" | "impaired" | "other";
  disputed: boolean;
  /** One figure per bucket for the table's current year. */
  current: number[];
  /** The row printed under it (Infosys) or in [brackets] (Tech Mahindra) when the table carries both years. */
  prior: number[] | null;
};

export type AgeingTable = {
  page: number;
  unit: string | null;
  /** The latest four-digit year named near the table's heading, if any. Used only to pick the latest table. */
  year_hint: number | null;
  buckets: string[];
  rows: AgeingRow[];
  /** Sum of the rows, bucket by bucket (the total row when printed, otherwise computed). */
  total: number[];
  total_prior: number[] | null;
  /** Allowance for expected credit loss when the table prints it (a positive amount). */
  allowance: number | null;
  /** How many figure rows added up to their own total, and how many were seen but did not. */
  rows_checked: number;
  rows_rejected: number;
  /** The printed total row agrees with the sum of the rows. Null when no total row is printed. */
  total_agrees: boolean | null;
  /** The table as printed, one line per row, for the reader to check. */
  excerpt: string;
};

const HEADER = /Outstanding for (?:the )?following periods|from (?:the )?due date of|Outstanding as at/i;
/** A wrapped column-heading line ("Less than", "6 months", "- 1 year 1-2 years", "More than"). It names a period, never a receivable. */
const isHeaderLine = (t: string) => /\b(?:months?|years?|more than|less than|not due|particulars|due date of payment|outstanding (?:as at|for))\b/i.test(t) && !/receivable|disputed|allowance/i.test(t);
const STOP = /^(Note\b|The (?:following|activity)|Market Risk|Credit risk|Liquidity)/i;
const UNIT = /\b(crore|crores|lakh|lakhs|million|millions|billion)\b/i;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const tolerance = (total: number) => Math.max(2, Math.abs(total) * 0.002);

/** A row of 6 or 7 figures where the last is the total of the others. */
function bucketVector(cells: number[]): number[] | null {
  if (cells.length !== 7 && cells.length !== 6) return null;
  const parts = cells.slice(0, -1), total = cells[cells.length - 1];
  return Math.abs(sum(parts) - total) <= tolerance(total) ? cells : null;
}

const near = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= Math.max(2, Math.abs(b[i]) * 0.002));

function qualityOf(label: string): AgeingRow["quality"] {
  if (/credit[- ]impaired|significant increase in credit risk|doubtful/i.test(label)) return "impaired";
  if (/considered good|good/i.test(label)) return "good";
  return "other";
}

type Raw = { label: string; vector: number[]; bracketed: boolean; text: string };

/** The tables on one page. A table starts at the "outstanding for following periods" heading and ends at the next heading or a note. */
function tablesOnPage(page: PdfPage): AgeingTable[] {
  const lines = page.text.split("\n");
  const out: AgeingTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!HEADER.test(lines[i])) { i++; continue; }
    // Context just above the heading: a unit and a year.
    const above = lines.slice(Math.max(0, i - 12), i + 1).join(" ");
    let years = [...above.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    // No year beside the heading: a later table on the page is the year before the one above it (the reports list the current year first); the first one
    // takes the latest year the page dates anything "as at", the best available hint.
    const before = out[out.length - 1];
    if (years.length === 0 && before?.year_hint != null) years = [before.year_hint - 1];
    else if (years.length === 0) years = [...page.text.matchAll(/(?:as at|as on|march|31)\s*,?\s*(?:\d{1,2}\s*)?(?:march\s*)?,?\s*(20\d{2})/gi)].map((m) => Number(m[1]));
    const unit = UNIT.exec(above)?.[1]?.toLowerCase() ?? null;
    const raws: Raw[] = [];
    let allowance: number | null = null;
    let pending: string[] = [];
    let rejected = 0;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (j > i + 1 && HEADER.test(line)) break;
      if (raws.length > 0 && STOP.test(line.trim())) break;
      const row: Row | null = parseRow(line);
      if (!row) {
        const t = line.trim();
        if (t !== "" && !isHeaderLine(t)) pending.push(t);
        if (pending.length > 5) pending.shift();
        continue;
      }
      // A label wrapped over several lines puts its first part above the figures; a lower-case inline remainder ("good") belongs to it.
      const label = (/^[a-z]/.test(row.label) || row.label === "" ? [...pending, row.label].join(" ") : row.label).replace(/\s+/g, " ").trim();
      pending = [];
      const isAllowance = /allowance|provision for (?:doubtful|expected)|expected credit loss/i.test(label);
      if (isAllowance && row.cells.length <= 2) { if (allowance == null) allowance = Math.abs(row.cells[0].value); continue; }
      if (isAllowance || /^less\b/i.test(label)) { if (allowance == null && row.cells.length >= 6) allowance = Math.abs(row.cells[row.cells.length - 1].value); continue; }
      if (/unbilled/i.test(label)) continue; // unbilled revenue is not aged by due date; it is a separate line under the table
      const vector = bucketVector(row.cells.map((c) => c.value));
      if (vector) raws.push({ label, vector, bracketed: row.bracketed, text: row.text });
      else if (row.cells.length >= 6 && row.cells.length <= 7) rejected++;
    }
    i = Math.max(j, i + 1);
    if (raws.length === 0) continue;

    // Is this a receivables table? Its rows say "receivable" (payables tables say MSME / Others / dues).
    if (!raws.some((r) => /receivable/i.test(r.label)) && !raws.some((r) => r.label === "" && /receivable/i.test(above))) continue;
    if (raws.every((r) => /MSME|payable|dues/i.test(r.label) && !/receivable/i.test(r.label))) continue;

    // Sort the rows into leaves, their prior-year twins, and totals.
    const rows: AgeingRow[] = [];
    let totalRow: number[] | null = null, totalPrior: number[] | null = null;
    for (const r of raws) {
      const prev = rows[rows.length - 1];
      const leaves = rows.map((x) => x.current);
      const isTotalLabel = /^(total|gross)\b/i.test(r.label);
      const sumOfLeaves = leaves.length >= 1 ? leaves[0].map((_, k) => sum(leaves.map((l) => l[k]))) : null;
      if (r.bracketed && prev && prev.prior == null) { prev.prior = r.vector; continue; }
      if (totalRow && !totalPrior && (r.label === "" || isTotalLabel)) { totalPrior = r.vector; continue; }
      if (!totalRow && (isTotalLabel || (r.label === "" && sumOfLeaves && leaves.length >= 2 && near(r.vector, sumOfLeaves)))) { totalRow = r.vector; continue; }
      if (r.label === "" && prev && prev.prior == null) { prev.prior = r.vector; continue; }
      if (r.label === "" ) continue;
      if (isTotalLabel) continue;
      rows.push({ label: r.label, quality: qualityOf(r.label), disputed: /^disputed|disputed trade/i.test(r.label) && !/undisputed/i.test(r.label), current: r.vector, prior: null });
    }
    if (rows.length === 0 && !totalRow) continue;
    const width = (rows[0]?.current ?? totalRow!).length;
    const computed = Array.from({ length: width }, (_, k) => sum(rows.map((r) => r.current[k] ?? 0)));
    const total = totalRow ?? computed;
    const computedPrior = rows.length > 0 && rows.every((r) => r.prior) ? Array.from({ length: width }, (_, k) => sum(rows.map((r) => r.prior![k]))) : null;
    out.push({
      page: page.num, unit, year_hint: years.length ? Math.max(...years) : null,
      buckets: [...(width === 7 ? BUCKETS_7 : BUCKETS_6)], rows, total, total_prior: totalPrior ?? computedPrior,
      allowance, rows_checked: raws.length, rows_rejected: rejected,
      total_agrees: totalRow ? near(totalRow, computed) : null,
      excerpt: raws.map((r) => `${r.label ? r.label + "  " : ""}${r.text.replace(r.label, "").trim()}`).join("\n").slice(0, 1800),
    });
  }
  return out;
}

export function readReceivablesAgeing(pages: PdfPage[]): AgeingTable[] {
  return pages.filter((p) => /receivable/i.test(p.text) && HEADER.test(p.text)).flatMap(tablesOnPage);
}

// ---- what the tables say -----------------------------------------------------------------------------------------------------

export type AgeingSummary = {
  page: number;
  total: number;
  /** Fraction of the gross total outstanding over one year / over three years from the due date. */
  over_1y: number | null;
  over_3y: number | null;
  impaired: number;
  disputed: number;
  allowance: number | null;
  unit: string | null;
};

/** The headline numbers of one table, from its current-year total. Over-one-year is the 1-2, 2-3 and over-3 buckets together. */
export function summariseTable(t: AgeingTable): AgeingSummary | null {
  const grand = t.total[t.total.length - 1];
  if (!(grand > 0)) return null;
  const n = t.total.length;
  const b = (k: number) => t.total[n - 1 - k]; // k = 1: over 3 years ... counted from the right, before the total
  const over3 = b(1), over23 = b(2), over12 = b(3);
  return {
    page: t.page, total: grand, over_1y: (over12 + over23 + over3) / grand, over_3y: over3 / grand,
    impaired: sum(t.rows.filter((r) => r.quality === "impaired").map((r) => r.current[r.current.length - 1])),
    disputed: sum(t.rows.filter((r) => r.disputed).map((r) => r.current[r.current.length - 1])),
    allowance: t.allowance, unit: t.unit,
  };
}

/** Starting assumptions, not calibrated: said so in every finding. */
export const AGEING_THRESHOLDS = { over_1y_medium: 0.05, over_1y_high: 0.15, impaired_medium: 0.03 };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const amt = (v: number, unit: string | null) => `${v.toLocaleString(unit && /million|billion/i.test(unit) ? "en-US" : "en-IN")}${unit ? ` ${unit.replace(/s$/, "")}` : ""}`;

export type NoteFinding = { id: string; severity: "high" | "medium" | "info"; title: string; detail: string; page: number };

export function ageingFindings(tables: AgeingTable[]): NoteFinding[] {
  const out: NoteFinding[] = [];
  const A = AGEING_THRESHOLDS;
  // Only the latest year: a prior-year table is context, not a finding. A table with no year near its heading is read as an earlier one (the reports
  // list the current year first), so it is left out rather than guessed at.
  const latestYear = Math.max(0, ...tables.map((t) => t.year_hint ?? 0));
  const latest = tables.filter((t) => t.year_hint === latestYear).sort((a, b) => b.total[b.total.length - 1] - a.total[a.total.length - 1]);
  const main = latest[0];
  if (!main) return out;
  const s = summariseTable(main);
  if (s) {
    if (s.over_1y != null && s.over_1y >= A.over_1y_medium) {
      out.push({
        id: "ageing_over_1y", severity: s.over_1y >= A.over_1y_high ? "high" : "medium", page: main.page,
        title: `${pct(s.over_1y)} of trade receivables has been outstanding over a year past its due date`,
        detail: `${amt(Math.round(s.over_1y * s.total), s.unit)} of ${amt(s.total, s.unit)} gross is over a year overdue${s.over_3y ? `, ${pct(s.over_3y)} over three years` : ""}${s.allowance != null ? `; the allowance for credit loss is ${amt(s.allowance, s.unit)}, ${pct(s.allowance / s.total)} of gross` : ""}. Thresholds of ${A.over_1y_medium * 100}% and ${A.over_1y_high * 100}% are starting assumptions.`,
      });
    }
    if (s.impaired / s.total >= A.impaired_medium) {
      out.push({
        id: "ageing_impaired", severity: "medium", page: main.page,
        title: `${pct(s.impaired / s.total)} of trade receivables is marked credit impaired`,
        detail: `${amt(s.impaired, s.unit)} of ${amt(s.total, s.unit)} gross is classed credit impaired${s.allowance != null ? `; the allowance is ${amt(s.allowance, s.unit)}` : ""}.`,
      });
    }
  }
  // A smaller table in the same year (typically the non-current book): over a year overdue is what non-current means, so it is only worth a line when
  // the allowance does not cover most of it.
  for (const t of latest.slice(1)) {
    const x = summariseTable(t);
    // Long-dated means nothing is within a year of its due date. A smaller table that is not is the other basis (standalone or consolidated) of the same book.
    const shortBuckets = t.total.slice(0, t.total.length - 4);
    if (!x || !s || x.total < 0.005 * s.total || shortBuckets.some((v) => v > 0)) continue;
    const cover = x.allowance != null ? x.allowance / x.total : null;
    out.push({
      id: "ageing_long_dated", severity: cover != null && cover < 0.5 ? "medium" : "info", page: t.page,
      title: `A second receivables table holds ${amt(x.total, x.unit)}, ${pct(x.over_1y ?? 0)} of it over a year overdue`,
      detail: cover != null ? `The allowance against it is ${amt(x.allowance!, x.unit)}, ${pct(cover)} of the table.` : "No allowance is printed against this table.",
    });
  }
  return out;
}
