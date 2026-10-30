// The quarterly engine, against figures worked out by hand. Acme (technology, crore):
//   Q2 FY27 (30 Sep 2026): revenue 1,100, EBITDA 220, other income 20, PBT 200, tax 50, PAT 150
//   Q1 FY27 (30 Jun 2026): revenue 1,050, EBITDA 215.25 (20.5%), PBT 195, PAT 146
//   Q2 FY26 (30 Sep 2025): revenue 1,000, EBITDA 200 (20%), other income 15, PBT 180, tax 45, PAT 135
//   Q4 FY26 (31 Mar 2026): revenue 1,020, EBITDA 204;  Q3 FY26 (31 Dec 2025): revenue 1,010, EBITDA 202

import test from "node:test";
import assert from "node:assert/strict";
import { buildResultsBrief, findPriorQuarter, findSameQuarterLastYear, pickQuarter, priorQuarterEnd, quartersOnFile, trailingTwelveMonths } from "../../app/sentinel/lib/quarterly";
import { near, st, ws } from "./helpers";
import type { FinancialStatement } from "../../app/sentinel/lib/types";

const q = (id: string, type: "Q1" | "Q2" | "Q3" | "Q4", label: string, end: string, over: Partial<FinancialStatement> = {}) =>
  st(id, { period_type: type, period_label: label, period_end_date: end, ...over });

const acme = () => [
  q("acme", "Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: 1100, ebitda: 220, other_income: 20, profit_before_tax: 200, tax_expense: 50, profit_after_tax: 150 }),
  q("acme", "Q1", "Q1 FY27", "2026-06-30", { revenue_from_operations: 1050, ebitda: 215.25, other_income: 18, profit_before_tax: 195, tax_expense: 49, profit_after_tax: 146 }),
  q("acme", "Q4", "Q4 FY26", "2026-03-31", { revenue_from_operations: 1020, ebitda: 204, profit_before_tax: 185, profit_after_tax: 140 }),
  q("acme", "Q3", "Q3 FY26", "2025-12-31", { revenue_from_operations: 1010, ebitda: 202, profit_before_tax: 182, profit_after_tax: 137 }),
  q("acme", "Q2", "Q2 FY26", "2025-09-30", { revenue_from_operations: 1000, ebitda: 200, other_income: 15, profit_before_tax: 180, tax_expense: 45, profit_after_tax: 135 }),
];
const peer = (id: string, rev: number, ebitda: number, revPrev: number, ebitdaPrev: number, patNow = 100, patPrev = 90) => [
  q(id, "Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: rev, ebitda, profit_before_tax: patNow * 1.3, profit_after_tax: patNow }),
  q(id, "Q2", "Q2 FY26", "2025-09-30", { revenue_from_operations: revPrev, ebitda: ebitdaPrev, profit_before_tax: patPrev * 1.3, profit_after_tax: patPrev }),
  q(id, "Q1", "Q1 FY27", "2026-06-30", { revenue_from_operations: rev * 0.97, ebitda: ebitda * 0.97, profit_before_tax: patNow * 1.2, profit_after_tax: patNow * 0.9 }),
];
const tech = (id: string, over = {}) => ws(id, { sector: "technology", ...over });

test("a quarter's predecessor is the month end three months back, across year ends and leap days", () => {
  assert.equal(priorQuarterEnd("2026-09-30"), "2026-06-30");
  assert.equal(priorQuarterEnd("2026-03-31"), "2025-12-31");
  assert.equal(priorQuarterEnd("2026-06-30"), "2026-03-31");
  assert.equal(priorQuarterEnd("2024-05-31"), "2024-02-29");
  assert.equal(priorQuarterEnd("2026-09-30", 12), "2025-09-30");
});


test("prior quarter and same quarter last year are looked up by end date and basis", () => {
  const all = [...acme(), q("acme", "Q2", "Q2 FY26", "2025-09-30", { basis: "standalone", revenue_from_operations: 1 })];
  const now = all[0];
  assert.equal(findPriorQuarter(now, all)?.period_label, "Q1 FY27");
  assert.equal(findSameQuarterLastYear(now, all)?.revenue_from_operations, 1000); // the consolidated one, not the standalone row
  const q1 = all[1];
  assert.equal(findPriorQuarter(q1, all)?.period_label, "Q4 FY26"); // the first quarter follows the last quarter of the year before
});

test("the brief: revenue +4.76% on the quarter and +10.0% on the year, EBITDA margin 20.0% (-50 bps on the quarter, level on the year), tax rate 25%", () => {
  const brief = buildResultsBrief([tech("acme")], acme(), "acme")!;
  assert.equal(brief.period_label, "Q2 FY27");
  assert.deepEqual([brief.prior_quarter_label, brief.prior_year_label], ["Q1 FY27", "Q2 FY26"]);
  const line = (k: string) => brief.lines.find((l) => l.key === k)!;
  assert.equal(line("revenue").current, 1100);
  assert.ok(near(line("revenue").qoq, 50 / 1050, 1e-9));
  assert.ok(near(line("revenue").yoy, 0.1, 1e-9));
  assert.ok(near(line("ebitda_margin").current, 0.2, 1e-9));
  assert.ok(near(line("ebitda_margin").qoq, 0.2 - 215.25 / 1050, 1e-9)); // 20.0% - 20.5% = -0.5 points
  assert.ok(near(line("ebitda_margin").yoy, 0, 1e-9));
  assert.ok(near(line("tax_rate").current, 0.25, 1e-9));
  assert.ok(near(line("pat_margin").current, 150 / 1100, 1e-9));
  assert.ok(near(line("pat").yoy, 15 / 135, 1e-9));
});

test("a calm quarter raises no flags", () => {
  const all = [...acme(), ...peer("p1", 2200, 462, 2000, 420), ...peer("p2", 3300, 693, 3000, 630)];
  const brief = buildResultsBrief([tech("acme"), tech("p1"), tech("p2")], all, "acme")!;
  assert.deepEqual(brief.flags.map((f) => f.id), []);
});

test("trailing twelve months: the quarter and the three before it added - revenue 4,180, EBITDA 827 (19.8%)", () => {
  const all = acme();
  const r = trailingTwelveMonths(all[0], all, 1, 4);
  assert.ok("ttm" in r);
  if ("ttm" in r) {
    assert.equal(r.ttm.revenue, 1100 + 1050 + 1020 + 1010);
    assert.ok(near(r.ttm.ebitda, 220 + 215.25 + 204 + 202, 1e-9));
    assert.ok(near(r.ttm.ebitda_margin, 841.25 / 4180, 1e-9));
    assert.equal(r.ttm.basis, "four quarters");
    assert.deepEqual(r.ttm.labels, ["Q2 FY27", "Q1 FY27", "Q4 FY26", "Q3 FY26"]);
  }
});

test("trailing twelve months says which quarter is missing instead of guessing, and uses the audited year when the quarter closes it", () => {
  const all = acme().filter((s) => s.period_label !== "Q3 FY26");
  const missing = trailingTwelveMonths(all[0], all, 1, 4);
  assert.deepEqual(missing, { missing: ["Q3 FY26"] });
  const q4 = acme()[2];
  const fy = st("acme", { period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", revenue_from_operations: 4000, ebitda: 800, profit_after_tax: 560 });
  const r = trailingTwelveMonths(q4, [...acme(), fy], 1, 4);
  assert.ok("ttm" in r && r.ttm.basis === "financial year" && r.ttm.revenue === 4000);
});

test("peers are matched on the same period end; those that have not reported are named; medians use the ones that have", () => {
  const all = [...acme(), ...peer("p1", 2200, 462, 2000, 420), ...peer("p2", 3300, 693, 3000, 630), q("p3", "Q1", "Q1 FY27", "2026-06-30", { revenue_from_operations: 500 })];
  const brief = buildResultsBrief([tech("acme"), tech("p1", { company_name: "P1" }), tech("p2", { company_name: "P2" }), tech("p3", { company_name: "P3" })], all, "acme")!;
  assert.deepEqual(brief.peers.reported.map((p) => p.company_name).sort(), ["P1", "P2"]);
  assert.deepEqual(brief.peers.not_reported, ["P3"]);
  const p1 = brief.peers.reported.find((p) => p.company_name === "P1")!;
  assert.ok(near(p1.revenue_yoy, 0.1, 1e-9));
  assert.ok(near(p1.ebitda_margin, 0.21, 1e-9));
  assert.ok(near(brief.peers.median.ebitda_margin, 0.21, 1e-9));
});

test("flags: revenue +30% on the year, margin down 400 bps on the quarter, other income 40% of PBT, a 10% tax rate - each with its own threshold in the words", () => {
  const all = acme();
  all[0] = { ...all[0], revenue_from_operations: 1300, ebitda: 260, other_income: 80, profit_before_tax: 200, tax_expense: 20, profit_after_tax: 180 };
  all[1] = { ...all[1], revenue_from_operations: 1250, ebitda: 300 }; // previous quarter margin 24%, this quarter 20%
  const brief = buildResultsBrief([tech("acme")], all, "acme")!;
  const ids = brief.flags.map((f) => f.id);
  for (const id of ["revenue_yoy", "ebitda_margin_qoq", "other_income", "tax_rate"]) assert.ok(ids.includes(id), `${id} in ${ids}`);
  const rev = brief.flags.find((f) => f.id === "revenue_yoy")!;
  assert.match(rev.title, /Revenue up 30\.0% on the same quarter last year/);
  assert.match(rev.detail, /20% swing threshold/); // technology's annual swing threshold
  assert.match(brief.flags.find((f) => f.id === "ebitda_margin_qoq")!.title, /EBITDA margin down 400 bps on the previous quarter/);
  assert.match(brief.flags.find((f) => f.id === "other_income")!.title, /Other income is 40% of profit before tax/);
  assert.deepEqual(ids, [...ids].sort((a, b) => brief.flags.find((f) => f.id === b)!.severity - brief.flags.find((f) => f.id === a)!.severity)); // most severe first
});

test("figures are shown in crore whatever unit the company reports in (110,000 lakh is 1,100 crore)", () => {
  const lakh = acme().map((s) => ({ ...s, revenue_from_operations: s.revenue_from_operations * 100, ebitda: s.ebitda == null ? null : s.ebitda * 100, profit_before_tax: s.profit_before_tax * 100, profit_after_tax: s.profit_after_tax * 100 }));
  const brief = buildResultsBrief([tech("acme", { currency_unit: "INR_LAKH" })], lakh, "acme")!;
  assert.equal(brief.lines.find((l) => l.key === "revenue")!.current, 1100);
});

test("missing comparisons are said plainly, and a basis that is not the company's own is noted", () => {
  const only = [q("acme", "Q2", "Q2 FY27", "2026-09-30", { basis: "standalone" })];
  const brief = buildResultsBrief([tech("acme", { comparison_basis: "consolidated" })], only, "acme")!;
  assert.equal(brief.lines[0].qoq, null);
  assert.equal(brief.lines[0].yoy, null);
  assert.match(brief.notes.join(" "), /Using standalone figures: consolidated is not on file/);
  assert.match(brief.notes.join(" "), /previous quarter \(Q1 FY27, standalone\) is not on file/);
  assert.match(brief.notes.join(" "), /same quarter last year \(Q2 FY26, standalone\) is not on file/);
  assert.equal(buildResultsBrief([tech("acme")], [st("acme", { period_type: "FY" })], "acme"), null);
});

test("quarters on file are listed newest first, once each, and pickQuarter prefers the company's own basis on a tie", () => {
  const all = [...acme(), q("acme", "Q2", "Q2 FY27", "2026-09-30", { basis: "standalone", revenue_from_operations: 5 })];
  assert.deepEqual(quartersOnFile(tech("acme"), all).map((x) => x.end), ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"]);
  assert.equal(pickQuarter(tech("acme", { comparison_basis: "consolidated" }), all)?.revenue_from_operations, 1100);
  assert.equal(pickQuarter(tech("acme", { comparison_basis: "standalone" }), all)?.revenue_from_operations, 5);
});
