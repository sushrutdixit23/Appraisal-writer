// Reading the statements out of a WHOLE annual report: the audited statement pages are chosen over pages that repeat the same line items, the running page head is
// not a column, lettered note references are not part of a label, and a heading whose figures sit on the lines below is added up.

import test from "node:test";
import assert from "node:assert/strict";
import { autofillFromPdfPages } from "../../app/sentinel/lib/autofill/pdf";
import { primaryStatement } from "../../app/sentinel/lib/extraction";
import type { AutofillPeriod } from "../../app/sentinel/lib/autofill/types";

const T = "\t";
const row = (label: string, ...cells: (string | number)[]) => [label, ...cells].join(` ${T}`);
const HEAD = `Integrated Annual Report 2025-26${T}282`;

// The directors' report tabulates the same lines for both bases, with a different expenses total (it nets items the statement does not).
const HIGHLIGHTS = [`Statutory Reports${T}Board's Report 65`, "Board's Report", "(Rs crore)", "Particulars Standalone Consolidated", "FY 2026 FY 2025 FY 2026 FY 2025",
  row("Revenue from operations", "9,000", "8,000", "9,900", "8,800"), row("Other income", "90", "80", "99", "88"), row("Total income", "9,090", "8,080", "9,999", "8,888"),
  row("Total expenses", "7,777", "6,666", "8,555", "7,333"), row("Profit before tax", "1,313", "1,414", "1,444", "1,555"), row("Tax expense", "313", "314", "344", "355"),
  row("Profit for the year", "1,000", "1,100", "1,100", "1,200"), row("Total assets", "5,000", "4,000", "5,500", "4,400"), row("Current assets", "2,000", "1,500", "2,200", "1,650"),
  row("Trade receivables", "999", "888", "1,099", "977")].join("\n");

const BS = [HEAD, "Standalone Balance Sheet (Rs crore)", `Note ${T}As at`, "March 31, 2026", "As at", "March 31, 2025", "ASSETS", "Non-current assets",
  row("Property, plant and equipment", "8(a)", "800", "700"), "Trade receivables", row("Billed", "6(b)", "10", "8"), row("Unbilled", "5", "4"),
  "Current assets", row("Inventories", "7", "100", "90"), "Trade receivables", row("Billed", "6(b)", "600", "500"), row("Unbilled", "200", "150"),
  row("Cash and cash equivalents", "6(c)", "300", "250"), row("Total current assets", "2,000", "1,500"), row("Total assets", "5,000", "4,000"),
  "EQUITY AND LIABILITIES", row("Total equity", "3,000", "2,400"), "Current liabilities", "Trade payables",
  row("Dues of small enterprises and micro enterprises", "6(h)", "20", "15"), row("Dues of creditors other than small enterprises and micro enterprises", "6(h)", "380", "285"),
  row("Other financial liabilities", "6(i)", "100", "90"), row("Total current liabilities", "1,200", "1,000"), row("Total liabilities", "2,000", "1,600")].join("\n");

const PL = [`Statutory Reports${T}Financial Statements`, "Standalone Financial Statements 283", "Standalone Statement of Profit and Loss (Rs crore)", `Note ${T}Year ended`, "March 31, 2026", "Year ended", "March 31, 2025",
  row("Revenue from operations", "10", "9,000", "8,000"), row("Other income", "11", "90", "80"), row("Total income", "9,090", "8,080"), row("Finance costs", "14", "40", "30"),
  row("Depreciation and amortisation expense", "200", "180"), row("Total expenses", "7,790", "6,680"), row("Profit before tax", "1,300", "1,400"), row("Tax expense", "300", "300"),
  row("Profit for the year", "1,000", "1,100")].join("\n");

const CF = [HEAD.replace("282", "286"), "Standalone Statement of Cash Flows", "(Rs crore)", "Year ended", "March 31, 2026", "Year ended", "March 31, 2025", "Cash flows from operating activities",
  row("Profit for the year", "1,000", "1,100"), row("Net cash generated from operating activities", "1,200", "1,150"), "Cash flows from investing activities",
  row("Payment for purchase of property, plant and equipment", "(250)", "(210)"), row("Net cash used in investing activities", "(400)", "(350)"),
  "Cash flows from financing activities", row("Net cash used in financing activities", "(700)", "(650)")].join("\n");

const TAX_NOTE = [HEAD.replace("282", "334"), "Notes forming part of Standalone Financial Statements", `Particulars Note ${T}Year ended`, "March 31, 2026 March 31, 2025",
  row("Profit before tax", "1,300", "1,400"), row("Tax expense", "327", "352"), row("Total income", "1", "2"), row("Current assets", "3", "4"), row("Trade receivables", "5", "6")].join("\n");

const PAGES = [HIGHLIGHTS, "A page of prose about strategy and people.", BS, PL, CF, TAX_NOTE].map((text, i) => ({ num: i + 1, text }));
const read = () => autofillFromPdfPages(PAGES, { preferredBasis: "standalone", fyStartMonth: 4 });
const v = (p: AutofillPeriod, f: string) => (p.fields as Record<string, { value: number | null } | undefined>)[f]?.value ?? null;

test("a page is a primary statement by its title or its Note column, and a notes page is not, even with a Note column", () => {
  assert.deepEqual(primaryStatement(BS), { primary: true, basis: "standalone" });
  assert.deepEqual(primaryStatement(PL), { primary: true, basis: "standalone" });
  assert.deepEqual(primaryStatement(`Some Report 240\nParticulars ${T}Note ${T}As at March 31,\n2026 ${T}2025\nAssets`), { primary: true, basis: null }); // title set as an image
  assert.equal(primaryStatement(HIGHLIGHTS).primary, false);
  assert.equal(primaryStatement(TAX_NOTE).primary, false);
  assert.equal(primaryStatement("Consolidated Balance Sheet\nNote As at").basis, "consolidated");
});

test("figures come from the audited statements, not from the directors' summary or a tax note that repeat the same lines", () => {
  const r = read();
  const cur = r.periods.find((p) => p.period_end_date === "2026-03-31")!;
  assert.equal(v(cur, "total_expenses"), 7790); // the statement's, not the summary's 7,777
  assert.equal(v(cur, "tax_expense"), 300); // not the tax note's 327
  assert.equal(v(cur, "profit_before_tax"), 1300);
  assert.match(r.notes.join(" "), /Read from the audited statement pages only \(p\.3, 4, 5\); 2 other pages/);
});

test("the running head's fiscal year is not a column: both years are read, each from its own column", () => {
  const r = read();
  const cur = r.periods.find((p) => p.period_end_date === "2026-03-31")!, prior = r.periods.find((p) => p.period_end_date === "2025-03-31")!;
  assert.ok(prior, "the previous year must be read");
  assert.deepEqual([v(cur, "total_assets"), v(prior, "total_assets")], [5000, 4000]);
  assert.deepEqual([v(cur, "cash_from_financing"), v(prior, "cash_from_financing")], [-700, -650]);
});

test("a lettered note reference is not part of the label", () => {
  const cur = read().periods.find((p) => p.period_end_date === "2026-03-31")!;
  assert.equal(v(cur, "fixed_assets"), 800);
  assert.equal(v(cur, "cash_and_equivalents"), 300);
  assert.equal(v(cur, "capex") != null && Math.abs(v(cur, "capex")!), 250);
});

test("a heading with its figures on the lines below is added up: receivables billed and unbilled (both sections), payables in two statutory lines", () => {
  const r = read();
  const cur = r.periods.find((p) => p.period_end_date === "2026-03-31")!, prior = r.periods.find((p) => p.period_end_date === "2025-03-31")!;
  assert.equal(v(cur, "trade_receivables"), 815); // 10 + 5 + 600 + 200
  assert.equal(v(prior, "trade_receivables"), 662); // 8 + 4 + 500 + 150
  assert.equal(v(cur, "unbilled_revenue"), 205); // 5 + 200
  assert.equal(v(cur, "trade_payables"), 400); // 20 + 380
  const field = (cur.fields as Record<string, { confidence?: string; source?: string } | undefined>).trade_receivables!;
  assert.equal(field.confidence, "low"); // worked out, so marked for checking
  assert.match(String(field.source), /Billed.*Unbilled/);
});
