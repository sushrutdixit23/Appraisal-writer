// Dates and periods for autofill: every way a filing or a spreadsheet names a period.

import test from "node:test";
import assert from "node:assert/strict";
import { findDates, fiscalYearEnd, parsePeriodHeader, periodForEndDate, quarterEnd } from "../../app/sentinel/lib/autofill/periods";

const dates = (s: string) => findDates(s).map((d) => d.iso);

test("dates: the ways an Indian filing writes one", () => {
  assert.deepEqual(dates("Year ended 31 March 2026"), ["2026-03-31"]);
  assert.deepEqual(dates("As at March 31, 2026"), ["2026-03-31"]);
  assert.deepEqual(dates("30th September, 2025"), ["2025-09-30"]);
  assert.deepEqual(dates("31-Mar-26"), ["2026-03-31"]);
  assert.deepEqual(dates("31-Mar-2026"), ["2026-03-31"]);
  assert.deepEqual(dates("31.03.2026"), ["2026-03-31"]);
  assert.deepEqual(dates("31/03/2026"), ["2026-03-31"]);
  assert.deepEqual(dates("2026-03-31"), ["2026-03-31"]);
  assert.deepEqual(dates("Mar-26"), ["2026-03-31"]);
  assert.deepEqual(dates("Mar 2026"), ["2026-03-31"]);
  assert.deepEqual(dates("February 2024"), ["2024-02-29"]); // leap year
});

test("dates: columns come back in reading order, once each", () => {
  assert.deepEqual(dates("For the year ended 31 March 2026 For the year ended 31 March 2025"), ["2026-03-31", "2025-03-31"]);
  assert.deepEqual(dates("31.12.2025 30.09.2025 31.12.2024"), ["2025-12-31", "2025-09-30", "2024-12-31"]);
});

test("dates: impossible dates and plain numbers are not dates", () => {
  assert.deepEqual(dates("31 February 2026"), []);
  assert.deepEqual(dates("Revenue 1,000.00 900.00"), []);
  assert.deepEqual(dates("Note 24"), []);
});

test("fiscal calendar: an April-March company", () => {
  assert.equal(fiscalYearEnd(2026, 4), "2026-03-31");
  assert.equal(quarterEnd(1, 2026, 4), "2025-06-30");
  assert.equal(quarterEnd(2, 2026, 4), "2025-09-30");
  assert.equal(quarterEnd(3, 2026, 4), "2025-12-31");
  assert.equal(quarterEnd(4, 2026, 4), "2026-03-31");
});

test("fiscal calendar: a calendar-year company and a July-June company", () => {
  assert.equal(fiscalYearEnd(2026, 1), "2026-12-31");
  assert.equal(quarterEnd(1, 2026, 1), "2026-03-31");
  assert.equal(quarterEnd(4, 2026, 1), "2026-12-31");
  assert.equal(fiscalYearEnd(2026, 7), "2026-06-30");
  assert.equal(quarterEnd(1, 2026, 7), "2025-09-30");
});

test("a period end date becomes a label and type", () => {
  assert.deepEqual(periodForEndDate("2026-03-31", "year"), { period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31" });
  assert.deepEqual(periodForEndDate("2025-12-31", "quarter"), { period_type: "Q3", period_label: "Q3 FY26", period_end_date: "2025-12-31" });
  assert.equal(periodForEndDate("2026-03-31", "quarter").period_label, "Q4 FY26");
  assert.equal(periodForEndDate("2025-06-30", "quarter").period_label, "Q1 FY26");
  assert.equal(periodForEndDate("2025-09-30", "quarter").period_label, "Q2 FY26");
  assert.equal(periodForEndDate("2025-12-31", "year", 1).period_label, "FY25"); // calendar-year company
});

const h = (s: string, fy = 4) => parsePeriodHeader(s, fy);

test("headers: fiscal years", () => {
  for (const s of ["FY26", "FY 26", "FY2026", "FY2025-26", "FY25-26", "FY 2025-26", "2025-26", "F.Y. 2025-26", "Audited FY26", "FY26 (Audited)"]) {
    const p = h(s);
    assert.equal(p.period_label, "FY26", s);
    assert.equal(p.period_type, "FY", s);
    assert.equal(p.period_end_date, "2026-03-31", s);
  }
});

test("headers: quarters", () => {
  assert.deepEqual([h("Q3 FY26").period_label, h("Q3 FY26").period_end_date, h("Q3 FY26").period_type], ["Q3 FY26", "2025-12-31", "Q3"]);
  assert.equal(h("Q4FY25").period_end_date, "2025-03-31");
  assert.equal(h("Q1 FY27").period_end_date, "2026-06-30");
  assert.equal(h("1QFY26").period_label, "Q1 FY26");
  assert.equal(h("Q2 2025-26").period_end_date, "2025-09-30");
  assert.equal(h("Quarter ended 31 December 2025").period_label, "Q3 FY26");
});

test("headers: dates read as a year when they end the fiscal year, as a quarter otherwise (and say so)", () => {
  assert.equal(h("Mar-26").period_label, "FY26");
  assert.equal(h("31 March 2026").period_type, "FY");
  assert.equal(h("Year ended 31 March 2026").period_label, "FY26");
  const dec = h("Dec-25");
  assert.equal(dec.period_label, "Q3 FY26");
  assert.match(dec.assumption ?? "", /as a quarter/);
  assert.equal(h("Quarter ended 31 March 2026").period_label, "Q4 FY26");
});

test("headers: periods Sentinel does not store are named, not guessed", () => {
  for (const s of ["9M FY26", "Nine months ended 31 December 2025", "H1 FY26", "Half year ended 30 September 2025", "TTM", "Trailing twelve months"]) {
    assert.ok(h(s).unsupported, s);
    assert.equal(h(s).period_label, null, s);
  }
});

test("headers: a bare year is a fiscal year, with the assumption stated; text that is not a period is empty", () => {
  const y = h("2026");
  assert.equal(y.period_label, "FY26");
  assert.match(y.assumption ?? "", /fiscal year ending in 2026/);
  assert.equal(h("Particulars").period_label, null);
  assert.equal(h("").period_label, null);
  assert.equal(h("Note").period_end_date, null);
});

test("headers: basis is picked up from the header", () => {
  assert.equal(h("Consolidated FY26").basis, "consolidated");
  assert.equal(h("Standalone Mar-26").basis, "standalone");
  assert.equal(h("FY26").basis, null);
});

test("headers: a calendar-year company's fiscal year", () => {
  assert.equal(h("FY2026", 1).period_end_date, "2026-12-31");
  assert.equal(h("Mar-26", 1).period_label, "Q1 FY26");
  assert.equal(h("Dec-25", 1).period_label, "FY25");
});
