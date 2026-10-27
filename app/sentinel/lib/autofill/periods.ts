// Sentinel autofill - dates and periods. Filings and spreadsheets name a period a dozen ways
// ("FY26", "2025-26", "Mar-26", "31.03.2026", "Q3 FY26", "Year ended 31 March 2026"). This turns any of
// them into the three things a statement needs: a period type, a label and an end date, using the
// company's own fiscal year (an April-March company's Q3 ends in December).

import type { Basis, PeriodType } from "../types";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = "january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";

const pad = (n: number) => String(n).padStart(2, "0");
export const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function fullYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

export type FoundDate = { iso: string; index: number; length: number };

/** Every calendar date in the text, in reading order. Month-and-year only ("Mar-26", "March 2026") means
 * the last day of that month, which is how a period end is written in a column header. */
export function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const add = (m: RegExpExecArray, y: number, mo: number, d: number | null) => {
    const s = m.index, e = m.index + m[0].length;
    if (overlaps(s, e)) return;
    // Claim the text even when the date turns out impossible ("31 February 2026"), so a later, looser
    // pattern cannot re-read part of it as a different date ("February 2026").
    taken.push([s, e]);
    if (mo < 1 || mo > 12) return;
    const day = d ?? lastDayOfMonth(y, mo);
    if (day < 1 || day > lastDayOfMonth(y, mo)) return;
    found.push({ iso: isoDate(y, mo, day), index: s, length: m[0].length });
  };

  // 2026-03-31
  for (const m of text.matchAll(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/g)) add(m as RegExpExecArray, +m[1], +m[2], +m[3]);
  // 31 March 2026, 31st March, 2026, 31-Mar-2026, 31-Mar-26
  for (const m of text.matchAll(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*(${MONTH_NAMES})[a-z]*\.?[\s\-/.,']*(\d{4}|\d{2})\b`, "gi")))
    add(m as RegExpExecArray, fullYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  // March 31, 2026
  for (const m of text.matchAll(new RegExp(String.raw`\b(${MONTH_NAMES})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "gi")))
    add(m as RegExpExecArray, +m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  // 31/03/2026, 31.03.2026, 31-03-2026 (day first, as Indian filings write it)
  for (const m of text.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/g)) add(m as RegExpExecArray, fullYear(+m[3]), +m[2], +m[1]);
  // Mar-26, Mar 2026, March 2026
  for (const m of text.matchAll(new RegExp(String.raw`\b(${MONTH_NAMES})[a-z]*\.?[\s\-/']*(\d{4}|\d{2})\b`, "gi")))
    add(m as RegExpExecArray, fullYear(+m[2]), MONTHS[m[1].toLowerCase()], null);

  return found.sort((a, b) => a.index - b.index);
}

/** Month a fiscal year ends in, given the month it starts (April start -> March end). */
export const fiscalYearEndMonth = (fyStartMonth: number) => (fyStartMonth <= 1 ? 12 : fyStartMonth - 1);

export function fyLabel(fiscalYear: number): string {
  return `FY${String(fiscalYear).slice(-2)}`;
}

/** The fiscal year (named by the calendar year it ENDS in) that a date falls in. */
export function fiscalYearOf(year: number, month: number, fyStartMonth: number): number {
  return fyStartMonth > 1 && month >= fyStartMonth ? year + 1 : year;
}

export type DerivedPeriod = { period_type: PeriodType; period_label: string; period_end_date: string };

/** Label and type for a period that ends on `iso`. `kind` says whether the column covers a year or a
 * quarter (a Q3 column for an April-March company ends in December). */
export function periodForEndDate(iso: string, kind: "year" | "quarter", fyStartMonth = 4): DerivedPeriod {
  const [y, m] = iso.split("-").map(Number);
  const fy = fiscalYearOf(y, m, fyStartMonth);
  if (kind === "year") return { period_type: "FY", period_label: fyLabel(fy), period_end_date: iso };
  const monthsIntoYear = (m - fyStartMonth + 12) % 12; // 0..11, months since the year started (end month counts as month 1 + n)
  const q = Math.floor(monthsIntoYear / 3) + 1;
  return { period_type: (`Q${q}` as PeriodType), period_label: `Q${q} ${fyLabel(fy)}`, period_end_date: iso };
}

/** End date of fiscal year `fy` (named by the year it ends in). */
export function fiscalYearEnd(fy: number, fyStartMonth = 4): string {
  const endMonth = fiscalYearEndMonth(fyStartMonth);
  return isoDate(fy, endMonth, lastDayOfMonth(fy, endMonth));
}

/** End date of quarter n of fiscal year `fy`. */
export function quarterEnd(n: number, fy: number, fyStartMonth = 4): string {
  const startYear = fyStartMonth > 1 ? fy - 1 : fy;
  const idx = fyStartMonth - 1 + 3 * n - 1; // months after January of startYear
  const year = startYear + Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return isoDate(year, month, lastDayOfMonth(year, month));
}

export type ParsedPeriodHeader = {
  period_type: PeriodType | null;
  period_label: string | null;
  period_end_date: string | null;
  basis: Basis | null;
  /** Set when the header names a period Sentinel does not store (nine months, half year, trailing twelve months). */
  unsupported: string | null;
  /** Set when the type or year had to be assumed. */
  assumption: string | null;
};

const EMPTY: ParsedPeriodHeader = { period_type: null, period_label: null, period_end_date: null, basis: null, unsupported: null, assumption: null };

/** Read a column or row header from a spreadsheet into a period. Anything it cannot place comes back with
 * nulls rather than a guess. */
export function parsePeriodHeader(raw: string, fyStartMonth = 4): ParsedPeriodHeader {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ...EMPTY };
  const lower = text.toLowerCase();
  const basis: Basis | null = /consolidated/.test(lower) ? "consolidated" : /standalone|stand-alone/.test(lower) ? "standalone" : null;
  const out = (p: Partial<ParsedPeriodHeader>): ParsedPeriodHeader => ({ ...EMPTY, basis, ...p });

  // Part-year and rolling periods: Sentinel stores full years and single quarters only.
  if (/\b(9m|nine months?|h1|h2|half[- ]?year(?:ly)?|six months?|ttm|ltm|trailing|cumulative|ytd|year to date)\b/.test(lower)) {
    return out({ unsupported: text });
  }

  // Q3 FY26, Q3FY26, Q3 2025-26, 3QFY26, Q3 26
  const spanQ = /\bq\s*([1-4])\s*[-: ]?\s*(?:fy)?\s*'?(\d{4})\s*[-/\u2013]\s*(\d{2}|\d{4})\b/i.exec(text);
  if (spanQ) {
    const first = +spanQ[2];
    const second = spanQ[3].length === 4 ? +spanQ[3] : Math.floor(first / 100) * 100 + +spanQ[3];
    const fy = fyStartMonth > 1 ? second : first;
    const n = +spanQ[1];
    return out({ period_type: (`Q${n}` as PeriodType), period_label: `Q${n} ${fyLabel(fy)}`, period_end_date: quarterEnd(n, fy, fyStartMonth) });
  }
  const shortQ =
    /\b([1-4])\s*q\s*[-: ]?\s*(?:fy)?\s*'?(\d{4}|\d{2})\b/i.exec(text) ??
    /\bq\s*([1-4])\s*[-: ]?\s*(?:fy)?\s*'?(\d{4}|\d{2})\b/i.exec(text);
  if (shortQ) {
    const n = +shortQ[1];
    const fy = fullYear(+shortQ[2]);
    return out({ period_type: (`Q${n}` as PeriodType), period_label: `Q${n} ${fyLabel(fy)}`, period_end_date: quarterEnd(n, fy, fyStartMonth) });
  }

  // FY2025-26, FY 25-26, F.Y. 2025-26, 2025-26
  let m = /\b(?:f\.?\s?y\.?\s*)?'?(\d{4})\s*[-/–]\s*(\d{2}|\d{4})\b(?![-/]\d)/i.exec(text);
  if (m && +m[1] >= 1990 && +m[1] <= 2100) {
    const second = m[2].length === 4 ? +m[2] : Math.floor(+m[1] / 100) * 100 + +m[2];
    // "2025-26" is a fiscal year; "2026-03" (the start of an ISO date) is not.
    if (second === +m[1] + 1) {
      const fy = fyStartMonth > 1 ? second : +m[1];
      return out({ period_type: "FY", period_label: fyLabel(fy), period_end_date: fiscalYearEnd(fy, fyStartMonth) });
    }
  }
  // FY25-26, FY 25-26 (two-digit years: the second one names the fiscal year)
  m = /\bf\.?\s?y\.?\s*'?(\d{2})\s*[-/\u2013]\s*(\d{2})\b/i.exec(text);
  if (m) {
    const fy = fullYear(+m[2]);
    return out({ period_type: "FY", period_label: fyLabel(fy), period_end_date: fiscalYearEnd(fyStartMonth > 1 ? fy : fullYear(+m[1]), fyStartMonth) });
  }
  // FY26, FY 26, FY2026, F.Y. 26
  m = /\bf\.?\s?y\.?\s*'?(\d{4}|\d{2})\b/i.exec(text);
  if (m) {
    const fy = fullYear(+m[1]);
    return out({ period_type: "FY", period_label: fyLabel(fy), period_end_date: fiscalYearEnd(fy, fyStartMonth) });
  }

  // A calendar date: "31 March 2026", "Mar-26", "31.03.2026", "Year ended 31 March 2026"
  const dates = findDates(text);
  if (dates.length > 0) {
    const iso = dates[dates.length - 1].iso;
    const month = +iso.slice(5, 7);
    const saysQuarter = /\b(quarter|three months?|3 months?)\b/.test(lower);
    const saysYear = /\b(year|annual|fy)\b/.test(lower);
    const endsFiscalYear = month === fiscalYearEndMonth(fyStartMonth);
    if (saysQuarter || (!saysYear && !endsFiscalYear)) {
      const p = periodForEndDate(iso, "quarter", fyStartMonth);
      return out({ ...p, assumption: saysQuarter ? null : `Read "${text}" as a quarter because it does not end in the fiscal year's last month.` });
    }
    const p = periodForEndDate(iso, "year", fyStartMonth);
    return out({
      ...p,
      assumption: endsFiscalYear ? null : `This year ends in ${iso.slice(0, 7)}, not the fiscal year's last month; labelled ${p.period_label}.`,
    });
  }

  // A bare year: "2026"
  m = /^'?(\d{4})$/.exec(text);
  if (m && +m[1] >= 1990 && +m[1] <= 2100) {
    const fy = +m[1];
    return out({
      period_type: "FY", period_label: fyLabel(fy), period_end_date: fiscalYearEnd(fy, fyStartMonth),
      assumption: `Read "${text}" as the fiscal year ending in ${fy}.`,
    });
  }
  return out({});
}


/** "2018-19" or "FY 2018-19" in a column header: a fiscal year, positioned like a date so it can be a column.
 * An ISO date ("2026-03-31") is not read as a range. */
export function findFiscalYearRanges(text: string, fyStartMonth = 4): FoundDate[] {
  const out: FoundDate[] = [];
  const dateSpans = findDates(text).map((d) => [d.index, d.index + d.length] as const);
  for (const m of text.matchAll(/\b(20\d{2}|19\d{2})\s*[-/\u2013]\s*(\d{4}|\d{2})\b(?![-/]\d)/g)) {
    const s = m.index ?? 0, e = s + m[0].length;
    if (dateSpans.some(([a, b]) => s < b && e > a)) continue;
    const first = +m[1];
    const second = m[2].length === 4 ? +m[2] : Math.floor(first / 100) * 100 + +m[2];
    if (second !== first + 1) continue; // "2018-19" is a fiscal year; "2018-35" is not
    const fy = fyStartMonth > 1 ? second : first;
    out.push({ iso: fiscalYearEnd(fy, fyStartMonth), index: s, length: m[0].length });
  }
  return out;
}
