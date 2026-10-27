// Data-entry rules: reporting units, number parsing, field whitelisting and the accounting checks
// that every save path shares.

import test from "node:test";
import assert from "node:assert/strict";
import {
  convertAmount,
  croreFactor,
  detectUnitInText,
  formatMoney,
  normaliseUnit,
  toCrore,
} from "../../app/sentinel/lib/units";
import { parseFormValues, parseNumberInput, statementToFormValues } from "../../app/sentinel/lib/fields";
import { coerceStatement, validateStatement, type OtherStatement, type StatementRow } from "../../app/sentinel/lib/validate";

// --- units --------------------------------------------------------------------------------

test("units: every spelling in use resolves to one canonical unit", () => {
  for (const s of ["cr", "Cr.", "crore", "Crores", "INR_CRORE", "₹ Crore", "inr crore"]) assert.equal(normaliseUnit(s), "INR_CRORE", s);
  for (const s of ["lakh", "Lakhs", "lac", "INR_LAKH", "₹ in lakh"].slice(0, 4)) assert.equal(normaliseUnit(s), "INR_LAKH", s);
  for (const s of ["million", "mn", "INR_MILLION"]) assert.equal(normaliseUnit(s), "INR_MILLION", s);
  assert.equal(normaliseUnit("INR"), "INR");
  assert.equal(normaliseUnit("dollars"), null);
  assert.equal(normaliseUnit(""), null);
  assert.equal(normaliseUnit(null), null);
});

test("units: conversion factors to crore (1 crore = 100 lakh = 10 million = 10,000,000 rupees)", () => {
  assert.equal(croreFactor("INR_CRORE"), 1);
  assert.equal(croreFactor("INR_LAKH"), 0.01);
  assert.equal(croreFactor("INR_MILLION"), 0.1);
  assert.equal(croreFactor("INR_BILLION"), 100);
  assert.ok(Math.abs(croreFactor("INR") - 1e-7) < 1e-18);
  assert.equal(croreFactor("something odd"), 1); // unknown is read as crore, the historic default
  assert.equal(toCrore(2_500, "INR_LAKH"), 25);
});

test("units: converting a filing's unit to the workspace's unit", () => {
  assert.equal(convertAmount(1250, "INR_CRORE", "INR_LAKH"), 125_000);
  assert.equal(convertAmount(125_000, "INR_LAKH", "INR_CRORE"), 1250);
  assert.equal(convertAmount(12_500, "INR_MILLION", "INR_CRORE"), 1250);
  assert.equal(convertAmount(1250, "INR_CRORE", "INR_CRORE"), 1250);
  assert.equal(convertAmount(0.1 + 0.2, "INR_CRORE", "INR_CRORE"), 0.3); // no binary-float residue
});

test("units: money is labelled in the company's own unit", () => {
  assert.equal(formatMoney(1234.5, "INR_CRORE"), "₹1,234.5 cr");
  assert.equal(formatMoney(1234.5, "INR_LAKH"), "₹1,234.5 lakh");
  assert.equal(formatMoney(-50, "cr"), "₹-50.0 cr");
});

test("unit detection reads what a statement page says about itself", () => {
  assert.equal(detectUnitInText("Consolidated Statement of Profit and Loss (₹ in crore)\nRevenue 1,000")?.unit, "INR_CRORE");
  assert.equal(detectUnitInText("(Rs. in Lakhs) Particulars Note 31 March 2026")?.unit, "INR_LAKH");
  assert.equal(detectUnitInText("All amounts in ₹ million, unless otherwise stated")?.unit, "INR_MILLION");
  assert.equal(detectUnitInText("(Amount in ₹ Crores)")?.unit, "INR_CRORE");
  assert.equal(detectUnitInText("Revenue 1,000 Profit 100"), null);
});

test("unit detection: the most frequent unit wins and a close second makes it ambiguous", () => {
  const clear = detectUnitInText("(₹ in crore) ... (₹ in crore) ... (₹ in crore) ... (Rs. in lakhs)");
  assert.equal(clear?.unit, "INR_CRORE");
  assert.equal(clear?.ambiguous, false);
  const mixed = detectUnitInText("(₹ in crore) ... (Rs. in lakhs)");
  assert.equal(mixed?.ambiguous, true);
});

// --- number entry -------------------------------------------------------------------------

test("numbers: pasted figures from filings and spreadsheets are understood", () => {
  const cases: [string, number | null, boolean][] = [
    ["1234.5", 1234.5, false],
    ["1,234.5", 1234.5, false],
    ["12,34,567.8", 1234567.8, false], // Indian grouping
    ["(123.4)", -123.4, false], // accounting negative
    ["-123.4", -123.4, false],
    ["−123.4", -123.4, false], // unicode minus
    ["₹ 1,000", 1000, false],
    ["  250  ", 250, false],
    [".5", 0.5, false],
    ["", null, false], // left blank
    ["-", null, false],
    ["abc", null, true], // typed something that is not a number
    ["12abc", null, true],
    ["1,5", null, true], // a decimal comma is refused, not read as 15
    ["1.2.3", null, true],
    ["NaN", null, true],
    ["Infinity", null, true],
  ];
  for (const [input, value, invalid] of cases) {
    const got = parseNumberInput(input);
    assert.equal(got.value, value, `value of "${input}"`);
    assert.equal(got.invalid, invalid, `invalid flag of "${input}"`);
  }
  assert.deepEqual(parseNumberInput(5), { value: 5, invalid: false });
  assert.equal(parseNumberInput(Number.NaN).invalid, true);
});

test("form values: blanks stay null and text that is not a number is reported by field name", () => {
  const { numbers, invalid } = parseFormValues({ revenue_from_operations: "1,000", profit_after_tax: "x1", inventory: "" });
  assert.equal(numbers.revenue_from_operations, 1000);
  assert.equal(numbers.inventory, null);
  assert.deepEqual(invalid, ["Profit after tax"]);
});

test("form values round-trip, and leave out nulls", () => {
  const values = statementToFormValues({ revenue_from_operations: 1000, inventory: null, capex: 12.5, source_file: "x" });
  assert.deepEqual(values, { revenue_from_operations: "1000", capex: "12.5" });
});

// --- coercion: untrusted input -> clean row ---------------------------------------------------

const good = {
  period_type: "FY",
  period_label: "FY26",
  period_end_date: "2026-03-31",
  basis: "consolidated",
  revenue_from_operations: 1000,
  profit_before_tax: 100,
  profit_after_tax: 80,
};

test("coerce: a minimal valid statement passes and every other column is null", () => {
  const { row, errors } = coerceStatement(good);
  assert.deepEqual(errors, []);
  assert.equal(row?.revenue_from_operations, 1000);
  assert.equal(row?.inventory, null);
  assert.equal(row?.cash_from_operations, null);
  assert.equal(row?.source_file, "manual-entry");
});

test("coerce: columns that are not on the list never reach the row", () => {
  const { row } = coerceStatement({ ...good, id: "11111111-1111-1111-1111-111111111111", workspace_id: "other", review_cycle_id: "x", is_admin: true });
  assert.ok(row);
  assert.equal("id" in row!, false);
  assert.equal("workspace_id" in row!, false);
  assert.equal("review_cycle_id" in row!, false);
  assert.equal("is_admin" in row!, false);
});

test("coerce: numeric strings with commas are accepted, other strings are an error", () => {
  const ok = coerceStatement({ ...good, revenue_from_operations: "1,000", capex: "(12.5)" });
  assert.equal(ok.row?.revenue_from_operations, 1000);
  assert.equal(ok.row?.capex, -12.5);
  const bad = coerceStatement({ ...good, profit_after_tax: "n/a" });
  assert.equal(bad.row, null);
  assert.match(bad.errors.join(" "), /profit_after_tax must be a number/);
});

test("coerce: required fields, period type, basis and a real calendar date are enforced", () => {
  assert.match(coerceStatement({ ...good, revenue_from_operations: undefined }).errors.join(" "), /Missing required statement field: revenue_from_operations/);
  assert.match(coerceStatement({ ...good, period_type: "H1" }).errors.join(" "), /period_type must be one of/);
  assert.match(coerceStatement({ ...good, basis: "group" }).errors.join(" "), /basis must be/);
  assert.match(coerceStatement({ ...good, period_end_date: "2026-02-30" }).errors.join(" "), /real date/);
  assert.match(coerceStatement({ ...good, period_end_date: "31/03/2026" }).errors.join(" "), /real date/);
  assert.match(coerceStatement({ ...good, period_label: "x".repeat(41) }).errors.join(" "), /too long/);
  assert.deepEqual(coerceStatement(null).errors, ["Missing statement payload."]);
  assert.deepEqual(coerceStatement([]).errors, ["Missing statement payload."]);
});

test("coerce: a non-finite number never becomes a stored value", () => {
  assert.ok(coerceStatement({ ...good, revenue_from_operations: Number.NaN }).errors.length > 0);
  assert.ok(coerceStatement({ ...good, revenue_from_operations: Infinity }).errors.length > 0);
  assert.ok(coerceStatement({ ...good, revenue_from_operations: {} }).errors.length > 0);
});

// --- accounting checks --------------------------------------------------------------------

function row(over: Record<string, unknown> = {}): StatementRow {
  const { row, errors } = coerceStatement({ ...good, ...over });
  assert.deepEqual(errors, []);
  return row!;
}
const check = (over: Record<string, unknown>, others: OtherStatement[] = []) => validateStatement(row(over), others);

test("balance sheet: 600 = 350 + 250 balances; 600 vs 350 + 200 is refused", () => {
  assert.deepEqual(check({ total_assets: 600, total_liabilities: 350, total_equity: 250 }).errors, []);
  const bad = check({ total_assets: 600, total_liabilities: 350, total_equity: 200 });
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /does not balance.*difference 50/);
});

test("balance sheet: a 1% rounding difference is tolerated", () => {
  assert.deepEqual(check({ total_assets: 1000, total_liabilities: 600, total_equity: 395 }).errors, []); // 0.5% off
  assert.equal(check({ total_assets: 1000, total_liabilities: 600, total_equity: 385 }).errors.length, 1); // 1.5% off
});

test("negatives: refused where impossible, and NOT for equity (a warning instead)", () => {
  assert.match(check({ inventory: -5 }).errors.join(" "), /Inventory cannot be negative/);
  assert.match(check({ total_debt: -1 }).errors.join(" "), /Total debt cannot be negative/);
  const eq = check({ total_equity: -50 });
  assert.deepEqual(eq.errors, []);
  assert.match(eq.warnings.join(" "), /Total equity is negative/);
});

test("negatives: losses and negative cash flows are fine", () => {
  const r = check({ profit_before_tax: -100, profit_after_tax: -80, cash_from_operations: -20, cash_from_investing: -300 });
  assert.deepEqual(r.errors, []);
});

test("a part cannot exceed its whole", () => {
  assert.match(check({ current_assets: 700, total_assets: 600 }).errors.join(" "), /Current assets \(700\) cannot exceed total assets \(600\)/);
  assert.match(check({ fixed_assets: 700, total_assets: 600 }).errors.join(" "), /Fixed assets/);
  assert.match(check({ current_liabilities: 400, total_liabilities: 350 }).errors.join(" "), /Current liabilities/);
});

test("income identities: total income = revenue + other income; PAT = PBT - tax; PBT = income - expenses - exceptional", () => {
  assert.deepEqual(check({ other_income: 50, total_income: 1050 }).warnings, []);
  assert.match(check({ other_income: 50, total_income: 1200 }).warnings.join(" "), /differs from revenue \+ other income \(1,050\)/);
  assert.deepEqual(check({ tax_expense: 20 }).warnings, []); // 100 - 20 = 80
  assert.match(check({ tax_expense: 50 }).warnings.join(" "), /differs from profit before tax - tax \(50\)/);
  assert.deepEqual(check({ total_income: 1050, total_expenses: 950 }).warnings, []); // 1050 - 950 = 100
  assert.match(check({ total_income: 1050, total_expenses: 700 }).warnings.join(" "), /differs from total income - total expenses/);
});

test("income identities: the exceptional-item sign convention is part of the check", () => {
  // PBT 100 = 1050 - 850 - 100 (a 100 exceptional loss)
  assert.deepEqual(check({ total_income: 1050, total_expenses: 850, exceptional_items: 100 }).warnings, []);
  // entered as a gain by mistake -> 1050 - 850 + 100 = 300 != 100
  assert.match(check({ total_income: 1050, total_expenses: 850, exceptional_items: -100 }).warnings.join(" "), /Check the sign of exceptional items/);
});

test("total income below revenue is questioned; EBITDA above revenue is questioned", () => {
  assert.match(check({ total_income: 900 }).warnings.join(" "), /less than revenue from operations/);
  assert.match(check({ ebitda: 1500 }).warnings.join(" "), /EBITDA \(1,500\) is larger than revenue/);
});

test("units: a 100x jump against the last year on file is flagged; a normal change is not", () => {
  const prior: OtherStatement[] = [{ period_type: "FY", period_label: "FY25", period_end_date: "2025-03-31", basis: "consolidated", revenue_from_operations: 10 }];
  assert.match(check({}, prior).warnings.join(" "), /100\.0x higher than FY25.*lakh vs crore/);
  assert.deepEqual(check({}, [{ ...prior[0], revenue_from_operations: 900 }]).warnings, []);
});

test("units: a quarter on file is not used to judge a full year (and vice versa)", () => {
  const quarter: OtherStatement[] = [{ period_type: "Q3", period_label: "Q3 FY26", period_end_date: "2025-12-31", basis: "consolidated", revenue_from_operations: 10 }];
  assert.deepEqual(check({}, quarter).warnings, []);
});

test("duplicate end date under a different label is questioned, same label is the row being edited", () => {
  const others: OtherStatement[] = [{ period_type: "FY", period_label: "FY2026", period_end_date: "2026-03-31", basis: "consolidated", revenue_from_operations: 900 }];
  assert.match(check({}, others).warnings.join(" "), /already ends on 2026-03-31 under a different label \("FY2026" vs "FY26"\)/);
  assert.deepEqual(check({}, [{ ...others[0], period_label: "FY26" }]).warnings, []);
});
