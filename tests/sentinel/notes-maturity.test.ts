// The liability-maturity reader, against the real FY26 notes of Wipro (standalone and consolidated), Tech Mahindra and Infosys. A row is accepted only when its first
// buckets add up to the figure after them, so a footnote marker or a stray column cannot become a bucket.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maturityFindings, readMaturities } from "../../app/sentinel/lib/autofill/notes/maturity";
import { parseRow } from "../../app/sentinel/lib/autofill/notes/numeric";

const load = (co: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `maturity-${co}.json`), "utf-8")) as { num: number; text: string }[];
const borrowings = (co: string) => readMaturities(load(co)).flatMap((t) => t.rows.filter((r) => r.kind === "borrowings").map((r) => ({ page: t.page, year: t.year_hint, buckets: r.buckets, total: r.total })));

test("Wipro standalone: borrowings of 61,988 million are all due in under a year (the rupee sign comes through as 'I'), the carrying value and interest columns are not buckets", () => {
  const b = borrowings("wipro").filter((x) => x.page === 231);
  assert.deepEqual(b, [{ page: 231, year: 2026, buckets: [61988, 0, 0, 0], total: 61988 }, { page: 231, year: 2025, buckets: [61290, 0, 0, 0], total: 61290 }]);
  const lease = readMaturities(load("wipro")).find((t) => t.page === 231)!.rows.find((r) => r.kind === "lease")!;
  assert.deepEqual([lease.buckets, lease.total], [[5135, 4250, 5134, 9284], 23803]);
});

test("Wipro consolidated (the rupee sign comes through as 'K', a footnote '(1)' in its own cell): 167,648 of 169,724 due in under a year, and no row starts with a phantom -1 bucket", () => {
  const t = readMaturities(load("wipro")).find((x) => x.page === 332 && x.year_hint === 2026)!;
  const row = t.rows.find((r) => r.kind === "borrowings")!;
  assert.deepEqual([row.buckets, row.total], [[167648, 2076, 0, 0], 169724]);
  assert.ok(t.rows.every((r) => r.buckets.every((v) => v >= 0)));
  assert.deepEqual(t.rows.find((r) => r.kind === "lease")!.buckets, [10492, 8315, 10152, 12855]);
});

test("findings: Wipro's borrowings are raised as high (100% and 99% due within a year, a third and a half of its liabilities); Tech Mahindra's 100% on 1% of liabilities is only information", () => {
  const w = maturityFindings(readMaturities(load("wipro")));
  assert.deepEqual(w.map((f) => [f.severity, f.page]), [["high", 231], ["high", 332]]);
  assert.match(w[0].title, /100% of borrowings fall due within a year \(33% of the liabilities in the table\)/);
  assert.match(w[1].title, /99% of borrowings fall due within a year \(51% of the liabilities in the table\)/);
  assert.match(w[0].detail, /starting assumptions/);
  const t = maturityFindings(readMaturities(load("tml")));
  assert.deepEqual(t.map((f) => f.severity), ["info"]);
});

test("a company with no borrowings row has none to report: Infosys lists trade payables and other liabilities only", () => {
  assert.deepEqual(borrowings("infosys"), []);
  assert.deepEqual(maturityFindings(readMaturities(load("infosys"))), []);
});

test("a construction-in-progress ageing table and an investments table have the same bucket headings but are not liabilities", () => {
  const cwip = { num: 1, text: "The following table presents the ageing schedule for capital work-in-progress\nParticulars \tLess than 1 year \t1-2 years \t2-3 years \tMore than 3 years \tTotal\nProjects in progress \t3322 \t450 \t350 \t0 \t4122" };
  assert.deepEqual(readMaturities([cwip]), []);
});

test("a row whose buckets do not add up to its total is dropped, not repaired", () => {
  const page = { num: 1, text: [
    "The table below provides the contractual maturities of financial liabilities",
    "Particulars \tLess than 1 year \t1-5 years \tMore than 5 years \tTotal",
    "Borrowings \t100 \t50 \t10 \t999",
    "Trade payables \t200 \t0 \t0 \t200",
  ].join("\n") };
  const [t] = readMaturities([page]);
  assert.deepEqual(t.rows.map((r) => r.label), ["Trade payables"]);
});

test("a rupee glyph the font turned into a letter does not become part of a label or a figure", () => {
  for (const g of ["I", "H", "K"]) {
    const row = parseRow(`Borrowings(1) \t${g} 167,648 \t${g} 2,076 \t${g} - \t${g} - \t${g} 169,724`)!;
    assert.deepEqual(row.cells.map((c) => c.value), [167648, 2076, 0, 0, 169724], g);
    assert.equal(row.label, "Borrowings(1)");
  }
});
