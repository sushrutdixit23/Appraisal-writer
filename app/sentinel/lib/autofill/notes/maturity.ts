// Sentinel autofill / notes - when borrowings (and leases and payables) fall due. Ind AS 107 makes a company print a table of the contractual maturities of its
// financial liabilities: how much is due within a year, in one to two, two to four and beyond. A balance sheet shows total debt; this shows the wall. A company with
// 100% of its borrowings due inside twelve months and cash to cover it is fine; one without is a refinancing story, and the table is where it shows first.
//
// Layouts differ in the buckets (Wipro: under 1 year, 1-2, 2-4, beyond 4, then total cash flows, interest included and carrying value; Tech Mahindra: under 1 year,
// 1-5, over 5, total), so a row is accepted by arithmetic, not by position: the first buckets must add up to the figure that follows them. A row that does not is
// dropped. Each table carries its page and the year it is stated at.
//
// What it does not do: say whether the company can pay (cash and facilities are elsewhere), or read a company that prints this as prose. A company with no
// borrowings row (Infosys, TCS, Tech Mahindra) simply has none to report.

import type { PdfPage } from "../../extraction";
import type { NoteFinding } from "./ageing";
import { parseRow } from "./numeric";

export type MaturityKind = "borrowings" | "lease" | "payables" | "other";
export type MaturityRow = { label: string; kind: MaturityKind; /** Amounts per bucket, earliest first. */ buckets: number[]; total: number; text: string };
export type MaturityTable = { page: number; unit: string | null; year_hint: number | null; bucket_count: number; rows: MaturityRow[]; excerpt: string };

const HEADER = /(?:less than|within|up ?to|under|not later than|0\s*[-–]\s*1)\s*(?:1|one)\s*year|1\s*year\s*or\s*less/i;
const UNIT = /\b(crore|crores|lakh|lakhs|million|millions|billion)\b/i;
const STOP = /^(?:The Company has not|The Group has not|Note\b|\d+\s+(?:Current|Deferred|Financial)\b)/i;

const kindOf = (label: string): MaturityKind => (/borrowings?|debentures?|term loans?|bonds?|notes? payable/i.test(label) && !/lease/i.test(label) ? "borrowings" : /lease/i.test(label) ? "lease" : /trade payables?/i.test(label) ? "payables" : "other");

/** The smallest k (2 to 6) for which the first k figures add up to the figure after them; the buckets are those k figures and the total is the one after. */
function bucketise(raw: number[]): { buckets: number[]; total: number } | null {
  // A footnote marker in its own cell ("Lease liabilities (1)") reads as a small negative figure; a bucket is never negative, so it is not one.
  const cells = [...raw];
  while (cells.length > 2 && cells[0] < 0 && cells[0] >= -9 && Number.isInteger(cells[0])) cells.shift();
  for (let k = 2; k <= 6 && k < cells.length; k++) {
    const sum = cells.slice(0, k).reduce((a, b) => a + b, 0);
    const total = cells[k];
    if (total > 0 && Math.abs(sum - total) <= Math.max(2, total * 0.002)) return { buckets: cells.slice(0, k), total };
  }
  return null;
}

function tablesOnPage(page: PdfPage): MaturityTable[] {
  const lines = page.text.split("\n");
  const out: MaturityTable[] = [];
  for (let i = 0; i < lines.length; i++) {
    // The header is spread over lines ("Less than" / "1 year ..."), so test it on the joined start of the block.
    if (!HEADER.test(lines.slice(i, i + 3).join(" ").replace(/\t/g, " "))) continue;
    const context = lines.slice(Math.max(0, i - 8), i + 1).join(" ");
    // A maturity table is introduced as one; a construction-in-progress ageing or an investments table has the same bucket headings but is not a liability table.
    // A second table on the page (the prior year) follows the first without repeating the introduction.
    if (!/maturit|contractual|financial liabilit/i.test(lines.slice(Math.max(0, i - 12), i + 1).join(" ")) && out.length === 0) continue;
    const years = [...context.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    const rows: MaturityRow[] = [];
    let pending = "";
    let j = i + 1;
    for (; j < Math.min(lines.length, i + 40); j++) {
      const line = lines[j];
      if (rows.length > 0 && (STOP.test(line.trim()) || (HEADER.test(lines.slice(j, j + 3).join(" ").replace(/\t/g, " ")) && /as (?:at|of|on)|march 31/i.test(lines.slice(j - 2, j + 1).join(" "))))) break;
      const row = parseRow(line);
      if (!row) { if (line.trim() !== "" && !/^(?:Particulars|Total cash|Interest|Carrying|included|value|years?|than|Non-Derivative|Derivative Financial Liabilities$)/i.test(line.trim()) && !/^[\d-]+\s*(?:years?|year)/i.test(line.trim())) pending = line.trim(); continue; }
      const label = (/^[a-z(]/.test(row.label) && pending ? `${pending} ${row.label}` : row.label || pending).replace(/\s+/g, " ").trim();
      pending = "";
      const b = bucketise(row.cells.map((c) => c.value));
      if (!b || label === "" || /^total$|projects? in progress|investments? in/i.test(label)) continue;
      rows.push({ label: label.slice(0, 90), kind: kindOf(label), buckets: b.buckets, total: b.total, text: row.text });
    }
    if (rows.length > 0) {
      out.push({
        page: page.num, unit: UNIT.exec(`${context} ${page.text.slice(0, 600)}`)?.[1]?.toLowerCase().replace(/s$/, "") ?? null,
        year_hint: years.length ? Math.max(...years) : null, bucket_count: Math.max(...rows.map((r) => r.buckets.length)), rows,
        excerpt: rows.map((r) => r.text).join("\n").slice(0, 1500),
      });
    }
    i = Math.max(i, j - 1);
  }
  return out;
}

export function readMaturities(pages: PdfPage[]): MaturityTable[] {
  return pages.filter((p) => /maturit/i.test(p.text) && /contractual|financial liabilit/i.test(p.text)).flatMap(tablesOnPage);
}

// ---- what they say ----------------------------------------------------------------------------------------------------------

/** Starting assumptions: the share of borrowings due within a year that is worth a line. */
export const MATURITY_THRESHOLDS = { medium: 0.5, high: 0.9, material: 0.05 };

const fmt = (v: number, unit: string | null) => `${v.toLocaleString(unit === "million" ? "en-US" : "en-IN")}${unit ? ` ${unit}` : ""}`;

export function maturityFindings(tables: MaturityTable[]): NoteFinding[] {
  const out: NoteFinding[] = [];
  const latest = Math.max(0, ...tables.map((t) => t.year_hint ?? 0));
  for (const t of tables.filter((x) => x.year_hint === latest)) {
    // The scale of the table: all the liabilities it lists. 100% of a 0.7%-of-liabilities borrowing is not a refinancing story.
    const liabilities = t.rows.reduce((n, r) => n + r.total, 0);
    for (const r of t.rows.filter((x) => x.kind === "borrowings")) {
      const share = r.buckets[0] / r.total;
      if (share < MATURITY_THRESHOLDS.medium) continue;
      const weight = liabilities > 0 ? r.total / liabilities : 0;
      const material = weight >= MATURITY_THRESHOLDS.material;
      out.push({
        id: "maturity_borrowings", severity: !material ? "info" : share >= MATURITY_THRESHOLDS.high ? "high" : "medium", page: t.page,
        title: `${(share * 100).toFixed(0)}% of borrowings fall due within a year (${(weight * 100).toFixed(0)}% of the liabilities in the table)`,
        detail: `${fmt(r.buckets[0], t.unit)} of ${fmt(r.total, t.unit)} (${r.label}) is contractually due in under a year. Whether the company can meet it depends on cash and unused facilities, which this table does not show: check them against the liquidity discussion. Thresholds of ${MATURITY_THRESHOLDS.medium * 100}% and ${MATURITY_THRESHOLDS.high * 100}% due within a year, and borrowings of at least ${MATURITY_THRESHOLDS.material * 100}% of the listed liabilities, are starting assumptions. As printed: "${r.text.slice(0, 200)}"`,
      });
    }
  }
  return out;
}
