// The deterministic PDF reader, on page text in several real-world layouts. No model is involved anywhere;
// every expected figure is worked out by hand from the fixture.

import test from "node:test";
import assert from "node:assert/strict";
import { autofillFromPdfPages, joinWrappedLines, readColumns, splitRow } from "../../app/sentinel/lib/autofill/pdf";
import { matchLabel, normaliseLabel } from "../../app/sentinel/lib/autofill/labels";
import type { PdfPage } from "../../app/sentinel/lib/extraction";
import { AutofillError } from "../../app/sentinel/lib/autofill/types";

const pg = (num: number, lines: string[]): PdfPage => ({ num, text: lines.join("\n") });

// ---- Ind AS annual report, consolidated, with a Note column --------------------------------------------------
const NOTE_BS = pg(10, [
  "Consolidated Balance Sheet as at March 31, 2026",
  "(₹ in crore)",
  "Particulars Note No. As at March 31, 2026 As at March 31, 2025",
  "ASSETS",
  "Non-current assets",
  "Property, plant and equipment 2 1,100.00 1,020.00",
  "Capital work-in-progress 2 80.00 60.00",
  "Current assets",
  "Inventories 7 250.00 230.00",
  "Financial assets",
  "Trade receivables 8 150.00 140.00",
  "Cash and cash equivalents 9 90.00 80.00",
  "Other bank balances 10 30.00 20.00",
  "Total current assets 800.00 760.00",
  "Total assets 2,000.00 1,860.00",
  "EQUITY AND LIABILITIES",
  "Equity share capital 15 50.00 50.00",
  "Other equity 16 1,050.00 930.00",
  "Equity attributable to owners of the Company 1,100.00 980.00",
  "Non-controlling interests 17 0.00 0.00",
  "Total equity 1,100.00 980.00",
  "Non-current liabilities",
  "Financial liabilities",
  "Borrowings 18 300.00 320.00",
  "Lease liabilities 19 60.00 55.00",
  "Total non-current liabilities 450.00 470.00",
  "Current liabilities",
  "Financial liabilities",
  "Borrowings 20 100.00 90.00",
  "Trade payables 21",
  "Total outstanding dues of micro enterprises and small enterprises 22.00 20.00",
  "Total outstanding dues of creditors other than micro enterprises and",
  "small enterprises 158.00 150.00",
  "Total current liabilities 450.00 410.00",
  "Total equity and liabilities 2,000.00 1,860.00",
]);
const NOTE_PL = pg(11, [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(₹ in crore)",
  "Particulars Note No. Year ended March 31, 2026 Year ended March 31, 2025",
  "Income",
  "Revenue from operations 24 1,000.00 900.00",
  "Other income 25 50.00 45.00",
  "Total income 1,050.00 945.00",
  "Expenses",
  "Cost of materials consumed 26 400.00 380.00",
  "Employee benefits expense 27 250.00 240.00",
  "Finance costs 28 20.00 22.00",
  "Depreciation and amortisation expense 2 60.00 58.00",
  "Other expenses 29 170.00 160.00",
  "Total expenses 900.00 860.00",
  "Profit before exceptional items and tax 150.00 85.00",
  "Exceptional items 30 30.00 -",
  "Profit before tax 120.00 85.00",
  "Tax expense",
  "Current tax 31 25.00 18.00",
  "Deferred tax 31 5.00 4.00",
  "Total tax expense 30.00 22.00",
  "Profit for the year 90.00 63.00",
  "Total comprehensive income for the year 91.00 64.00",
  "Profit attributable to:",
  "Owners of the Company 88.00 62.00",
  "Non-controlling interests 2.00 1.00",
  "Earnings per equity share (₹)",
  "Basic 8.80 6.20",
]);
const NOTE_CF = pg(12, [
  "Consolidated Statement of Cash Flows for the year ended March 31, 2026",
  "(₹ in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Cash flows from operating activities",
  "Profit before tax 120.00 85.00",
  "Cash generated from operations 200.00 170.00",
  "Income taxes paid (60.00) (50.00)",
  "Net cash generated from operating activities (A) 140.00 120.00",
  "Cash flows from investing activities",
  "Purchase of property, plant and equipment, including capital work-in-progress (190.00) (170.00)",
  "Net cash used in investing activities (B) (210.00) (150.00)",
  "Net cash generated from/(used in) financing activities (C) 60.00 25.00",
]);
const ANNUAL = [NOTE_BS, NOTE_PL, NOTE_CF];

const val = (p: { fields: Record<string, { value: number } | undefined> }, k: string) => p.fields[k]?.value;

test("annual report: the current year is read from the right column, note numbers dropped", () => {
  const r = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" });
  assert.equal(r.kind, "pdf");
  assert.equal(r.periods.length, 2); // this year and last year
  const [cur, prior] = r.periods;
  assert.equal(cur.period_end_date, "2026-03-31");
  assert.equal(cur.period_label, "FY26");
  assert.equal(cur.period_type, "FY");
  assert.equal(cur.basis, "consolidated");
  assert.equal(prior.period_label, "FY25");
  // Income statement, current year
  assert.equal(val(cur, "revenue_from_operations"), 1000); // not the note number 24
  assert.equal(val(cur, "other_income"), 50);
  assert.equal(val(cur, "total_income"), 1050);
  assert.equal(val(cur, "total_expenses"), 900);
  assert.equal(val(cur, "finance_costs"), 20);
  assert.equal(val(cur, "depreciation_amortisation"), 60); // note 2 dropped
  assert.equal(val(cur, "exceptional_items"), 30);
  assert.equal(val(cur, "profit_before_tax"), 120); // not "profit before exceptional items and tax" (150)
  assert.equal(val(cur, "tax_expense"), 30); // total, not current tax 25 or deferred 5
  assert.equal(val(cur, "profit_after_tax"), 90); // not attributable 88, not comprehensive 91
  // Prior year from the second column; "-" is nil
  assert.equal(val(prior, "revenue_from_operations"), 900);
  assert.equal(val(prior, "exceptional_items"), 0);
  assert.equal(val(prior, "profit_after_tax"), 63);
});

test("annual report: balance sheet, including the lines that must be told apart or added up", () => {
  const [cur, prior] = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" }).periods;
  assert.equal(val(cur, "total_assets"), 2000);
  assert.equal(val(cur, "current_assets"), 800);
  assert.equal(val(cur, "fixed_assets"), 1100); // PP&E only, not capital work-in-progress
  assert.equal(val(cur, "inventory"), 250);
  assert.equal(val(cur, "trade_receivables"), 150);
  assert.equal(val(cur, "cash_and_equivalents"), 90); // not "other bank balances"
  assert.equal(val(cur, "total_equity"), 1100); // "Total equity", not "equity attributable to owners" and not "total equity and liabilities"
  assert.equal(val(cur, "current_liabilities"), 450);
  assert.equal(val(cur, "trade_payables"), 180); // 22 + 158, from the two sub-lines (the wrapped label was joined)
  assert.equal(cur.fields.trade_payables?.derived, "dues to micro and small enterprises + dues to other creditors");
  assert.equal(val(cur, "total_debt"), 400); // borrowings 300 non-current + 100 current; lease liabilities left out
  assert.equal(cur.fields.total_debt?.confidence, "low");
  assert.equal(val(cur, "total_liabilities"), 900); // 450 + 450
  assert.equal(val(prior, "total_debt"), 410); // 320 + 90
  assert.equal(val(prior, "total_liabilities"), 880); // 470 + 410
});

test("annual report: cash flow reads the NET lines, keeps their signs, and makes capex positive", () => {
  const [cur] = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" }).periods;
  assert.equal(val(cur, "cash_from_operations"), 140); // not "cash generated from operations" (200, before tax)
  assert.equal(val(cur, "cash_from_investing"), -210);
  assert.equal(val(cur, "cash_from_financing"), 60);
  assert.equal(val(cur, "capex"), 190);
  assert.match(cur.fields.capex?.derived ?? "", /positive amount/);
});

test("annual report: EBITDA is offered only as a derived figure, with its formula", () => {
  const [cur] = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" }).periods;
  // PBT 120 + exceptional 30 + finance 20 + D&A 60 - other income 50
  assert.equal(val(cur, "ebitda"), 180);
  assert.equal(cur.fields.ebitda?.confidence, "low");
  assert.match(cur.fields.ebitda?.derived ?? "", /not printed/);
});

test("annual report: every figure says where it came from", () => {
  const [cur] = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" }).periods;
  assert.match(cur.fields.revenue_from_operations!.source, /^p\.11 \| Revenue from operations \| 24 {2}1,000\.00 {2}900\.00$/);
  assert.match(cur.fields.total_assets!.source, /^p\.10 \| Total assets/);
  assert.match(cur.fields.cash_from_operations!.source, /^p\.12 \|/);
});

test("annual report: a clean statement raises no accounting issues and the unit is read from the page", () => {
  const r = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" });
  assert.deepEqual(r.periods[0].issues, []);
  assert.equal(r.unit.unit, "INR_CRORE");
  assert.equal(r.unit.source, "page");
  assert.deepEqual(r.pages_used, [10, 11, 12]);
});

test("annual report: confidence is high for exact labels and low where the reading is a stretch", () => {
  const [cur] = autofillFromPdfPages(ANNUAL, { preferredBasis: "consolidated" }).periods;
  assert.equal(cur.fields.revenue_from_operations?.confidence, "high");
  assert.equal(cur.fields.profit_after_tax?.confidence, "high");
  assert.equal(cur.fields.total_liabilities?.confidence, "low");
});

// ---- the same statements without a Note column, tab separated ---------------------------------------------------
test("a table with no note column, tab separated, reads the same", () => {
  const plain = pg(5, [
    "Consolidated Statement of Profit and Loss for the year ended 31 March 2026",
    "(Rs. in crore)",
    "Particulars\tYear ended 31 March 2026\tYear ended 31 March 2025",
    "Revenue from operations\t1,000.00\t900.00",
    "Other income\t50.00\t45.00",
    "Total income\t1,050.00\t945.00",
    "Total expenses\t900.00\t860.00",
    "Finance costs\t20.00\t22.00",
    "Depreciation and amortisation expense\t60.00\t58.00",
    "Profit before tax\t130.00\t85.00",
    "Tax expense\t30.00\t22.00",
    "Profit for the year\t100.00\t63.00",
  ]);
  const [cur] = autofillFromPdfPages([plain]).periods;
  assert.equal(val(cur, "revenue_from_operations"), 1000);
  assert.equal(val(cur, "depreciation_amortisation"), 60);
  assert.equal(val(cur, "profit_after_tax"), 100);
  assert.equal(cur.period_label, "FY26");
});

// ---- statement title only, two figure columns ------------------------------------------------------------------
test("a title that names one date above two columns of figures reads the second as the previous year", () => {
  const r = autofillFromPdfPages([
    pg(3, [
      "Consolidated Statement of Profit and Loss for the year ended 31 March 2026",
      "Revenue from operations 1,000.00 900.00",
      "Other income 50.00 45.00",
      "Total income 1,050.00 945.00",
      "Total expenses 900.00 860.00",
      "Finance costs 20.00 22.00",
      "Profit before tax 150.00 85.00",
      "Tax expense 30.00 22.00",
      "Profit for the year 120.00 63.00",
    ]),
  ]);
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26", "FY25"]);
  assert.equal(val(r.periods[1], "revenue_from_operations"), 900);
  assert.match(r.notes.join(" "), /second was read as the previous year/);
});

// ---- quarterly results ----------------------------------------------------------------------------------------
const QUARTERLY = pg(2, [
  "Statement of Standalone Unaudited Financial Results for the Quarter and Nine Months ended December 31, 2025",
  "(Rs. in lakhs)",
  "Particulars Quarter ended Nine months ended Year ended",
  "31.12.2025 30.09.2025 31.12.2024 31.12.2025 31.12.2024 31.03.2025",
  "(Unaudited) (Unaudited) (Unaudited) (Unaudited) (Unaudited) (Audited)",
  "Revenue from operations 3,000.00 2,900.00 2,700.00 8,800.00 8,000.00 11,000.00",
  "Other income 40.00 35.00 30.00 110.00 90.00 125.00",
  "Total income 3,040.00 2,935.00 2,730.00 8,910.00 8,090.00 11,125.00",
  "Total expenses 2,700.00 2,620.00 2,500.00 7,950.00 7,400.00 10,100.00",
  "Finance costs 50.00 48.00 45.00 145.00 130.00 180.00",
  "Profit before tax 340.00 315.00 230.00 960.00 690.00 1,025.00",
  "Tax expense 85.00 80.00 60.00 240.00 175.00 260.00",
  "Net profit for the period 255.00 235.00 170.00 720.00 515.00 765.00",
]);

test("quarterly results: the three quarter columns become quarters, nine-month and year columns are skipped", () => {
  const r = autofillFromPdfPages([QUARTERLY]);
  assert.deepEqual(r.periods.map((p) => [p.period_label, p.period_type, p.period_end_date]), [
    ["Q3 FY26", "Q3", "2025-12-31"],
    ["Q2 FY26", "Q2", "2025-09-30"],
    ["Q3 FY25", "Q3", "2024-12-31"],
  ]);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 3000);
  assert.equal(val(r.periods[0], "profit_after_tax"), 255);
  assert.equal(val(r.periods[1], "revenue_from_operations"), 2900);
  assert.equal(val(r.periods[2], "profit_before_tax"), 230);
  assert.equal(r.unit.unit, "INR_LAKH");
  assert.equal(r.periods[0].basis, "standalone");
  assert.match(r.notes.join(" "), /Skipped nine-month columns/);
});

test("quarterly results read as a year when a year was asked for", () => {
  const r = autofillFromPdfPages([QUARTERLY], { periodType: "FY" });
  assert.deepEqual(r.periods.map((p) => p.period_end_date), ["2025-03-31"]);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 11000);
});

// ---- older Schedule III layout -------------------------------------------------------------------------------------
test("an older Schedule III layout: 'Revenue from operations (net)', '(Loss) before tax' in brackets, tax as 'Provision for tax'", () => {
  const old = pg(7, [
    "Statement of Profit and Loss for the year ended 31st March, 2019",
    "(Rs. in Crores)",
    "Particulars Note No. 2018-19 2017-18",
    "I. Revenue from operations (net) 20 500.00 450.00",
    "II. Other income 21 10.00 12.00",
    "III. Total revenue (I+II) 510.00 462.00",
    "IV. Expenses",
    "Finance costs 22 30.00 28.00",
    "Depreciation and amortization expense 23 25.00 24.00",
    "Total expenses 540.00 470.00",
    "V. (Loss)/Profit before tax (III-IV) (30.00) (8.00)",
    "VI. Provision for tax 24 5.00 -",
    "VII. (Loss)/Profit for the year (V-VI) (35.00) (8.00)",
  ]);
  const [cur] = autofillFromPdfPages([old]).periods;
  assert.equal(cur.period_end_date, "2019-03-31");
  assert.equal(val(cur, "revenue_from_operations"), 500);
  assert.equal(val(cur, "total_income"), 510); // "Total revenue"
  assert.equal(val(cur, "depreciation_amortisation"), 25); // American spelling
  assert.equal(val(cur, "profit_before_tax"), -30);
  assert.equal(val(cur, "tax_expense"), 5);
  assert.equal(val(cur, "profit_after_tax"), -35);
});

// ---- the pre-exceptional cross-check fixes a wrong sign ---------------------------------------------------------
test("exceptional items: the sign is set from the printed profit lines, and a gain comes out negative", () => {
  const gain = pg(4, [
    "Consolidated Statement of Profit and Loss for the year ended 31 March 2026",
    "Particulars Year ended 31 March 2026 Year ended 31 March 2025",
    "Revenue from operations 1,000.00 900.00",
    "Profit before exceptional items and tax 100.00 85.00",
    "Exceptional items (net) 40.00 -",
    "Profit before tax 140.00 85.00",
    "Tax expense 30.00 22.00",
    "Profit for the year 110.00 63.00",
    "Finance costs 20.00 22.00",
    "Total income 1,050.00 945.00",
  ]);
  const [cur] = autofillFromPdfPages([gain]).periods;
  assert.equal(val(cur, "exceptional_items"), -40); // printed as 40, but PBT went UP by 40: a gain
  assert.match(autofillFromPdfPages([gain]).periods[0].notes.join(" "), /sign was set to match/);
});

// ---- traps and refusals -----------------------------------------------------------------------------------------
test("a file with no statement pages is refused with a plain message", () => {
  assert.throws(
    () => autofillFromPdfPages([pg(1, ["Chairman's letter", "We had a good year."])]),
    (e) => e instanceof AutofillError && /No page of this file looks like a financial statement/.test(e.message)
  );
});

test("only the requested basis is read when standalone and consolidated both appear", () => {
  const standalone = pg(20, [
    "Standalone Statement of Profit and Loss for the year ended March 31, 2026",
    "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
    "Revenue from operations 700.00 640.00",
    "Other income 35.00 30.00",
    "Total income 735.00 670.00",
    "Total expenses 640.00 600.00",
    "Finance costs 12.00 11.00",
    "Profit before tax 95.00 70.00",
    "Tax expense 25.00 18.00",
    "Profit for the year 70.00 52.00",
  ]);
  const all = [standalone, ...ANNUAL];
  assert.equal(val(autofillFromPdfPages(all, { preferredBasis: "consolidated" }).periods[0], "revenue_from_operations"), 1000);
  assert.equal(val(autofillFromPdfPages(all, { preferredBasis: "standalone" }).periods[0], "revenue_from_operations"), 700);
  assert.equal(autofillFromPdfPages(all, { preferredBasis: "standalone" }).periods[0].basis, "standalone");
});

test("an inconsistent statement is filled but flagged, with the fields involved downgraded", () => {
  const bad = pg(5, [
    "Consolidated Statement of Profit and Loss for the year ended 31 March 2026",
    "Particulars Year ended 31 March 2026 Year ended 31 March 2025",
    "Revenue from operations 1,000.00 900.00",
    "Other income 50.00 45.00",
    "Total income 1,050.00 945.00",
    "Total expenses 900.00 860.00",
    "Finance costs 20.00 22.00",
    "Profit before tax 150.00 85.00",
    "Tax expense 30.00 22.00",
    "Profit for the year 95.00 63.00", // 150 - 30 = 120, not 95
  ]);
  const [cur] = autofillFromPdfPages([bad]).periods;
  assert.equal(val(cur, "profit_after_tax"), 95);
  assert.ok(cur.issues.some((i) => /differs from profit before tax - tax \(120\)/.test(i.message)));
  assert.equal(cur.fields.profit_after_tax?.confidence, "low");
});

// ---- the small pieces -------------------------------------------------------------------------------------------
test("rows: figures are read from the END of the line, never from numbers inside the label", () => {
  assert.deepEqual(splitRow("Tax expense (refer note 35) 30.00 22.00"), { label: "Tax expense (refer note 35)", tokens: ["30.00", "22.00"] });
  assert.deepEqual(splitRow("Revenue from operations 24 1,000.00 900.00"), { label: "Revenue from operations", tokens: ["24", "1,000.00", "900.00"] });
  assert.deepEqual(splitRow("Exceptional items 30 30.00 -"), { label: "Exceptional items", tokens: ["30", "30.00", "-"] });
  assert.deepEqual(splitRow("Net cash used (210.00) (150.00)"), { label: "Net cash used", tokens: ["(210.00)", "(150.00)"] });
  assert.equal(splitRow("Particulars Note No."), null);
});

test("rows: a percentage at the end of a line is not an amount", () => {
  assert.equal(splitRow("EBITDA margin 18.5%"), null);
});

test("rows: a label wrapped onto the next line is joined before matching", () => {
  assert.deepEqual(joinWrappedLines(["Total outstanding dues of creditors other than micro enterprises and", "small enterprises 158.00 150.00", "Total current liabilities 450.00 410.00"]), [
    "Total outstanding dues of creditors other than micro enterprises and small enterprises 158.00 150.00",
    "Total current liabilities 450.00 410.00",
  ]);
  // A heading followed by a capitalised row is NOT joined.
  assert.deepEqual(joinWrappedLines(["Financial assets", "Trade receivables 150.00 140.00"]), ["Financial assets", "Trade receivables 150.00 140.00"]);
});

test("headers: columns and kinds, whichever way the header is printed", () => {
  assert.deepEqual(readColumns(["Particulars As at March 31, 2026 As at March 31, 2025"]), [
    { end_date: "2026-03-31", kind: "year" }, { end_date: "2025-03-31", kind: "year" },
  ]);
  assert.deepEqual(readColumns(["Quarter ended 31.12.25 30.09.25 31.12.24 Nine months ended 31.12.25 31.12.24 Year ended 31.03.25"]).map((c) => c.kind), [
    "quarter", "quarter", "quarter", "nine", "nine", "year",
  ]);
  assert.deepEqual(readColumns(["Quarter ended Nine months ended Year ended", "31.12.2025 30.09.2025 31.12.2024 31.12.2025 31.12.2024 31.03.2025"]).map((c) => c.kind), [
    "quarter", "quarter", "quarter", "nine", "nine", "year",
  ]);
  assert.deepEqual(readColumns(["Quarter ended Quarter ended Quarter ended", "31.12.2025 30.09.2025 31.12.2024"]).map((c) => c.kind), ["quarter", "quarter", "quarter"]);
  assert.deepEqual(readColumns(["no dates here"]), []);
});

test("labels: the near-miss lines resolve to the right field, or to none", () => {
  const m = (s: string, st: "pl" | "bs" | "cf" | null = null) => matchLabel(s, st)?.target ?? null;
  assert.equal(m("Profit before tax"), "profit_before_tax");
  assert.equal(m("Profit/(loss) before tax"), "profit_before_tax");
  assert.equal(m("Profit before exceptional items and tax"), "pre_exceptional_pbt");
  assert.equal(m("Profit before exceptional items and share of profit of associates and tax"), "pre_exceptional_pbt");
  assert.equal(m("Profit for the year"), "profit_after_tax");
  assert.equal(m("Profit for the year from continuing operations"), "profit_after_tax");
  assert.equal(m("Profit attributable to owners of the Company"), null);
  assert.equal(m("Total comprehensive income for the year"), null);
  assert.equal(m("Earnings per share"), null);
  assert.equal(m("Total equity"), "total_equity");
  assert.equal(m("Total equity and liabilities"), "total_equity_and_liabilities");
  assert.equal(m("Equity attributable to owners of the Company"), null);
  assert.equal(m("Net cash generated from operating activities (A)"), "cash_from_operations");
  assert.equal(m("Cash generated from operations"), null);
  assert.equal(m("Cash flows from operating activities"), null);
  assert.equal(m("Net cash used in investing activities"), "cash_from_investing");
  assert.equal(m("Purchase of property, plant and equipment"), "capex");
  assert.equal(m("Depreciation and amortization expense"), "depreciation_amortisation");
  assert.equal(m("IV. Total expenses"), "total_expenses");
  assert.equal(m("(a) Cash and cash equivalents"), "cash_and_equivalents");
  assert.equal(m("Profit before tax", "cf"), null); // the cash-flow statement restates it; it is not the P&L figure
  assert.equal(m("Total assets", "pl"), null);
});

test("labels: normalisation drops brackets, numbering, notes and punctuation", () => {
  assert.equal(normaliseLabel("III. Total revenue (I+II)"), "total revenue");
  assert.equal(normaliseLabel("Tax expense (refer note 35)"), "tax expense");
  assert.equal(normaliseLabel("Profit / (Loss) before Tax"), "profit before tax");
  assert.equal(normaliseLabel("Depreciation & amortisation"), "depreciation and amortisation");
  assert.equal(normaliseLabel("Shareholders’ funds"), "shareholders funds");
});
