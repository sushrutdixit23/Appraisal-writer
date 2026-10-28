// A trial balance read into statement figures, against a hand-worked small services company. The ledger names are
// the ones a Tally or Zoho export actually carries; every expected figure below is worked out on paper in the comments.

import test from "node:test";
import assert from "node:assert/strict";
import { autofillFromSheet } from "../../app/sentinel/lib/autofill/sheet";
import { classifyLedger } from "../../app/sentinel/lib/autofill/trialBalance";

const TB = (extra: string[][] = []) => [
  ["Acme Services Pvt Ltd"],
  ["Trial Balance as on 31-Mar-2026"],
  ["Particulars", "Debit", "Credit"],
  ["Sales - Software Services", "", "1,00,00,000"],
  ["Interest Received", "", "1,00,000"],
  ["Share Capital", "", "20,00,000"],
  ["Reserves & Surplus", "", "15,00,000"],
  ["Sundry Creditors", "", "8,00,000"],
  ["GST Payable", "", "2,00,000"],
  ["Term Loan HDFC", "", "10,00,000"],
  ["Salaries", "50,00,000", ""],
  ["Rent", "6,00,000", ""],
  ["Purchases - Subcontract", "15,00,000", ""],
  ["Depreciation", "4,00,000", ""],
  ["Interest Paid on Term Loan", "1,50,000", ""],
  ["Income Tax Expense", "5,00,000", ""],
  ["Computer Equipment", "30,00,000", ""],
  ["Sundry Debtors", "25,00,000", ""],
  ["HDFC Bank A/c", "15,00,000", ""],
  ["Prepaid Expenses", "4,50,000", ""],
  ...extra,
];

const read = (rows: string[][], opts: Record<string, unknown> = {}) => autofillFromSheet(rows, { kind: "xlsx", ...opts });
const f = (r: ReturnType<typeof read>, k: string) => (r.periods[0].fields as any)[k]?.value;

test("a ledger-wise trial balance becomes statement figures, worked out on paper", () => {
  const r = read(TB());
  assert.equal(r.layout, "trial balance");
  // Income 1,00,00,000 + 1,00,000 = 1,01,00,000. Expenses: purchases 15,00,000 + salaries 50,00,000 + rent 6,00,000
  // + depreciation 4,00,000 + interest 1,50,000 = 76,50,000. PBT = 24,50,000; tax 5,00,000; PAT = 19,50,000.
  assert.equal(f(r, "revenue_from_operations"), 10_000_000);
  assert.equal(f(r, "total_income"), 10_100_000);
  assert.equal(f(r, "total_expenses"), 7_650_000);
  assert.equal(f(r, "profit_before_tax"), 2_450_000);
  assert.equal(f(r, "profit_after_tax"), 1_950_000);
  // Current assets 15,00,000 cash + 25,00,000 debtors + 4,50,000 prepaid = 44,50,000; fixed 30,00,000; total 74,50,000.
  assert.equal(f(r, "current_assets"), 4_450_000);
  assert.equal(f(r, "total_assets"), 7_450_000);
  // Current liabilities 8,00,000 creditors + 2,00,000 GST = 10,00,000; plus the 10,00,000 term loan = 20,00,000.
  assert.equal(f(r, "current_liabilities"), 1_000_000);
  assert.equal(f(r, "total_liabilities"), 2_000_000);
  assert.equal(f(r, "total_debt"), 1_000_000);
  // Equity 20,00,000 + 15,00,000 + the period's profit 19,50,000 = 54,50,000, and 54,50,000 + 20,00,000 = total assets.
  assert.equal(f(r, "total_equity"), 5_450_000);
  assert.equal(f(r, "total_equity") + f(r, "total_liabilities"), f(r, "total_assets"));
});

test("the period comes from the 'as on' date above the table, and the unit is assumed to be rupees and says so", () => {
  const r = read(TB());
  assert.equal(r.periods[0].period_label, "FY26");
  assert.equal(r.periods[0].period_end_date, "2026-03-31");
  assert.equal(r.unit.unit, "INR");
  assert.equal(r.unit.ambiguous, true);
  const given = read(TB().filter((row) => !/^Trial Balance/.test(row[0])), { periodEndDate: "2025-03-31" });
  assert.equal(given.periods[0].period_label, "FY25");
});

test("every figure is marked for review, and nothing balances on its own say-so: the notes explain the limits", () => {
  const r = read(TB());
  assert.ok(Object.values(r.periods[0].fields).every((h) => h!.confidence !== "high"));
  assert.ok(r.periods[0].notes.some((n) => /No closing stock/.test(n)));
  assert.ok(r.periods[0].notes.every((n) => !/does not balance/.test(n)));
});

test("a ledger it cannot place is listed with its amount and the identity check shows the gap - nothing is forced", () => {
  const r = read(TB([["Mystery Ledger 77", "1,00,000", ""], ["Zorblax Adjustment", "", "1,00,000"]]));
  const notes = r.periods[0].notes.join(" ");
  assert.match(notes, /2 ledger\(s\) could not be placed/);
  assert.match(notes, /Mystery Ledger 77/);
  assert.equal(f(r, "total_assets"), 7_450_000, "an unplaced ledger is not added to anything");
});

test("a trial balance that does not balance is called out", () => {
  const r = read(TB([["Salaries - extra", "9,99,999", ""]]));
  assert.match(r.periods[0].notes.join(" "), /does not balance: debits total/);
});

test("a single 'Closing Balance' column with Dr/Cr suffixes and a Group column works the same", () => {
  const rows = [
    ["Ledger", "Group", "Closing Balance"],
    ["Acme Sales", "Sales Accounts", "10,00,000 Cr"],
    ["Wages", "Indirect Expenses", "4,00,000 Dr"],
    ["Axis Current Account", "Bank Accounts", "3,00,000 Dr"],
    ["Owner Funds", "Capital Account", "9,00,000 Cr"],
  ];
  const r = read(rows, { periodEndDate: "2026-03-31" });
  assert.equal(f(r, "revenue_from_operations"), 1_000_000);
  assert.equal(f(r, "total_expenses"), 400_000);
  assert.equal(f(r, "cash_and_equivalents"), 300_000);
  assert.equal(f(r, "profit_after_tax"), 600_000);
});

test("classification: 'rent' inside 'current' is not rent, bank charges are an expense, a bank OD is a loan, a debit GST ledger is an asset", () => {
  assert.equal(classifyLedger("Axis Current Account", null, 100)?.bucket, "cash");
  assert.equal(classifyLedger("Bank Charges", null, 100)?.bucket, "opex");
  assert.equal(classifyLedger("HDFC Bank OD", null, -100)?.bucket, "debt_current");
  assert.equal(classifyLedger("GST Input Credit", null, 100)?.bucket, "other_current_assets");
  assert.equal(classifyLedger("GST Payable", null, -100)?.bucket, "other_current_liabilities");
  assert.equal(classifyLedger("Loans Given to Staff", null, 100)?.bucket, "other_current_assets");
  assert.equal(classifyLedger("Zzz Unknown", null, 100), null);
});
