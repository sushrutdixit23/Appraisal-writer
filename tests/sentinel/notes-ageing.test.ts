// The receivables ageing reader, against the real FY26 annual reports of TCS, Infosys, Tech Mahindra, Wipro and HCLTech (the ageing pages are kept as
// fixtures), and against synthetic tables for the cases a real report does not show. The expected figures were checked by hand against the printed
// tables. Five companies, five layouts: one table per year (TCS, Wipro), last year's row under each row (Infosys), last year in [brackets] (Tech Mahindra),
// a label wrapped above its figures (HCLTech).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { ageingFindings, readReceivablesAgeing, summariseTable } from "../../app/sentinel/lib/autofill/notes/ageing";
import { parseRow, parseToken } from "../../app/sentinel/lib/autofill/notes/numeric";
import { near } from "./helpers";

const load = (co: string) => JSON.parse(fs.readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `ageing-${co}.json`), "utf8")) as { num: number; text: string }[];
const current = (co: string) => {
  const tables = readReceivablesAgeing(load(co));
  const latest = Math.max(...tables.map((t) => t.year_hint ?? 0));
  return tables.filter((t) => t.year_hint === latest).sort((a, b) => b.total[6] - a.total[6])[0];
};

test("figures: commas, brackets for negatives, [brackets] for last year, nil dashes, and a currency glyph the PDF turned into a letter", () => {
  assert.deepEqual(parseToken("1,23,456"), { value: 123456, bracketed: false });
  assert.deepEqual(parseToken("(648)"), { value: -648, bracketed: false });
  assert.deepEqual(parseToken("[2,367]"), { value: 2367, bracketed: true });
  assert.equal(parseToken("–")?.value, 0);
  assert.equal(parseToken("considered"), null);
  const row = parseRow("Undisputed Trade receivables – considered good \tI 72,784 \tI 21,775 \tI 705 \tI 171 \tI 262 \tI 2,487 \tI 98,184")!;
  assert.equal(row.label, "Undisputed Trade receivables – considered good");
  assert.deepEqual(row.cells.map((c) => c.value), [72784, 21775, 705, 171, 262, 2487, 98184]);
  // prose that merely contains a number is not a figure row
  assert.equal(parseRow("The Company has 12 branches across 4 states"), null);
});

test("TCS (one table per year, consolidated): 58,267 crore gross, 8.5% over a year overdue, 393 credit impaired, allowance 637 - and it matches the balance sheet", () => {
  const t = current("tcs");
  assert.deepEqual(t.total, [46331, 5726, 1240, 4402, 272, 296, 58267]);
  assert.equal(t.allowance, 637);
  assert.equal(t.unit, "crore");
  assert.equal(t.total_agrees, true);
  assert.equal(t.rows_rejected, 0);
  const s = summariseTable(t)!;
  near(s.over_1y!, (4402 + 272 + 296) / 58267);
  assert.equal(s.impaired, 393);
  assert.equal(s.disputed, 51);
  // The balance sheet prints billed receivables of 57,874 and credit-impaired 393 on the page before: 57,874 + 393 = 58,267.
  assert.equal(57874 + 393, t.total[6]);
});

test("TCS keeps the prior-year table apart, and the non-current book (747 crore, 87% provided) is reported as information, not as a 100%-overdue alarm", () => {
  const tables = readReceivablesAgeing(load("tcs"));
  const years = tables.map((t) => [t.page, t.year_hint, t.total[6]]);
  assert.deepEqual(years, [[183, 2026, 747], [183, 2025, 790], [184, 2026, 58267], [184, 2025, 50747]]);
  const found = ageingFindings(tables);
  assert.deepEqual(found.map((f) => [f.id, f.severity]), [["ageing_over_1y", "medium"], ["ageing_long_dated", "info"]]);
  assert.match(found[1].detail, /allowance against it is 648 crore, 86\.7% of the table/);
});

test("Infosys (last year's row under each row): both years read, the printed total agrees, nothing is flagged on a 0.3% tail", () => {
  const t = current("infosys");
  assert.deepEqual(t.total, [24748, 5992, 30, 19, 9, 79, 30877]);
  assert.deepEqual(t.total_prior, [20082, 6463, 84, 194, 59, 94, 26976]);
  assert.equal(t.allowance, 540);
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.rows[0].prior, [20082, 6458, 80, 150, 31, 6, 26807]);
  assert.equal(t.total_agrees, true);
  assert.equal(summariseTable(t)!.impaired, 93 + 18);
  assert.deepEqual(ageingFindings([t]), []);
});

test("Tech Mahindra (last year in [brackets], labels printed above the figures, million): 76,820 million gross, 12.2% over a year, allowance 10,344", () => {
  const tables = readReceivablesAgeing(load("tml"));
  const t = tables.find((x) => x.total[6] === 76820)!;
  assert.deepEqual(t.total_prior, [32563, 18849, 4042, 4072, 2804, 2601, 64931]);
  assert.equal(t.allowance, 10344); // the "Less: Allowances" row is the allowance, not a receivables row
  assert.equal(t.rows.length, 2);
  assert.equal(t.unit, "million");
  assert.equal(t.total_agrees, true);
  near(summariseTable(t)!.over_1y!, (2999 + 2603 + 3761) / 76820);
  assert.ok(t.rows.every((r) => !/allowance/i.test(r.label)));
  assert.ok(t.rows.every((r) => !/^year\b/i.test(r.label)), "a wrapped column heading must not leak into a label");
});

test("Wipro (rupee glyph read as 'I', one table per year): 102,886 million gross, allowance 6,270, the prior year's table is the year before", () => {
  const tables = readReceivablesAgeing(load("wipro"));
  assert.deepEqual(tables.map((t) => [t.year_hint, t.total[6]]), [[2026, 102886], [2025, 85960]]);
  const t = tables[0];
  assert.equal(t.allowance, 6270);
  assert.equal(t.rows.length, 3);
  assert.equal(t.total_agrees, true);
  assert.equal(summariseTable(t)!.disputed, 1541);
});

test("HCLTech (a label wrapped over two lines above its figures, 'Less than' in the heading): all three rows kept, not read as an allowance", () => {
  const t = current("hcl");
  assert.deepEqual(t.total, [2850, 2623, 33, 13, 24, 25, 5568]);
  assert.equal(t.allowance, 39);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0].label, "Undisputed – considered good");
  assert.equal(t.total_agrees, true);
  // the unbilled line under the table (7,890, all not yet due) is not an ageing row
  assert.ok(t.total[6] === 5568);
});

test("a row whose buckets do not add up to its total is dropped and counted, never repaired", () => {
  const page = { num: 1, text: [
    "Ageing of trade receivables (₹ crore)",
    "Particulars \tNot due \tOutstanding for following periods from due date of payment \tTotal",
    "Undisputed trade receivables – considered good \t100 \t50 \t10 \t5 \t3 \t2 \t170",
    "Undisputed trade receivables – credit impaired \t1 \t2 \t3 \t4 \t5 \t6 \t99",
  ].join("\n") };
  const [t] = readReceivablesAgeing([page]);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows_checked, 1);
  assert.equal(t.rows_rejected, 1);
});

test("a trade-payables or work-in-progress ageing table is not read as receivables", () => {
  const page = { num: 1, text: [
    "Trade payables ageing schedule",
    "Particulars \tNot due \tOutstanding for following periods from due date of payment \tTotal",
    "MSME \t10 \t5 \t1 \t1 \t0 \t0 \t17",
    "Others \t200 \t50 \t10 \t5 \t3 \t2 \t270",
  ].join("\n") };
  assert.deepEqual(readReceivablesAgeing([page]), []);
});

test("a long tail is flagged with the thresholds named as assumptions; a clean book is not", () => {
  const rows = (cells: number[]) => cells.join(" \t");
  const book = (over: number[]) => [{ num: 1, text: [
    "Ageing for trade receivables as at March 31, 2026 (₹ crore)",
    "Particulars \tNot due \tOutstanding for following periods from due date of payment \tTotal",
    `Undisputed trade receivables – considered good \t${rows(over)}`,
  ].join("\n") }];
  const risky = ageingFindings(readReceivablesAgeing(book([600, 100, 50, 100, 80, 70, 1000])));
  assert.equal(risky[0].id, "ageing_over_1y");
  assert.equal(risky[0].severity, "high"); // 250 of 1,000 is 25%
  assert.match(risky[0].detail, /starting assumptions/);
  assert.deepEqual(ageingFindings(readReceivablesAgeing(book([900, 90, 5, 3, 1, 1, 1000]))), []);
});
