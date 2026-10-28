// CSV and Excel autofill: both layouts, awkward CSV, a real .xlsx, and the route. No model is involved, and a
// test below proves the route never calls one.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { autofillFromSheet, parseCsv } from "../../app/sentinel/lib/autofill/sheet";
import { xlsxToRows } from "../../app/sentinel/lib/autofill/xlsx";
import { AutofillError } from "../../app/sentinel/lib/autofill/types";
import { POST } from "../../app/api/sentinel/autofill/route";
import { FakeBackend, useBackend } from "./fake-backend";
import { ANNUAL_REPORT_PAGES, makeBlankPdf, makePdf } from "./pdf-fixtures";

const val = (p: { fields: Record<string, { value: number } | undefined> }, k: string) => p.fields[k]?.value;
const read = (csv: string, opts: Record<string, unknown> = {}) => autofillFromSheet(parseCsv(csv), { kind: "csv", ...opts });

// ---- CSV parsing --------------------------------------------------------------------------------------------
test("csv: quoted cells with commas, doubled quotes, CRLF and a byte-order mark", () => {
  const rows = parseCsv('﻿Name,Value\r\n"Revenue, net","1,000.50"\r\n"He said ""hi""",3\r\n');
  assert.deepEqual(rows, [["Name", "Value"], ["Revenue, net", "1,000.50"], ['He said "hi"', "3"]]);
});

test("csv: semicolon, tab and pipe separated files are read", () => {
  assert.deepEqual(parseCsv("a;b;c\n1;2;3"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv("a\tb\tc\n1\t2\t3"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv("a|b|c\n1|2|3"), [["a", "b", "c"], ["1", "2", "3"]]);
  // A semicolon file whose numbers use commas for thousands is not mistaken for a comma file.
  assert.deepEqual(parseCsv('Item;FY26\nRevenue;"1,000"'), [["Item", "FY26"], ["Revenue", "1,000"]]);
});

// ---- shape A: line items down, periods across -----------------------------------------------------------------
const STATEMENT_CSV = [
  "Acme Industries - Consolidated,,,",
  "(Rs. in Lakhs),,,",
  "Particulars,FY26,FY25,FY24",
  'Revenue from operations,"1,00,000.00","90,000.00","80,000.00"',
  'Other income,"5,000","4,500","4,000"',
  'Total income,"1,05,000","94,500","84,000"',
  'EBITDA,"18,000","16,000","14,000"',
  'Depreciation and amortisation,"6,000","5,800","5,500"',
  'Finance costs,"2,000","2,200","2,400"',
  'Profit before tax,"12,000","8,500",(500)',
  'Tax expense,"3,000","2,200",0',
  'Profit after tax,"9,000","6,300",(500)',
  "Balance Sheet,,,",
  'Total assets,"2,00,000","1,86,000","1,70,000"',
  'Total equity,"1,10,000","98,000","90,000"',
  'Borrowings (non-current),"30,000","32,000","33,000"',
  'Borrowings (current),"10,000","9,000","8,000"',
  'Total current liabilities,"45,000","41,000","40,000"',
  'Total non-current liabilities,"45,000","47,000","40,000"',
].join("\n");

test("shape A: a five-line-item statement in lakh becomes one period per column, newest first", () => {
  const r = read(STATEMENT_CSV);
  assert.equal(r.layout, "line items down, periods across");
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26", "FY25", "FY24"]);
  assert.deepEqual(r.periods.map((p) => p.period_end_date), ["2026-03-31", "2025-03-31", "2024-03-31"]);
  assert.equal(r.unit.unit, "INR_LAKH");
  assert.equal(r.unit.source, "sheet");
  assert.equal(r.periods[0].basis, "consolidated"); // from the title row
  const [fy26, , fy24] = r.periods;
  assert.equal(val(fy26, "revenue_from_operations"), 100000); // Indian grouping 1,00,000.00
  assert.equal(val(fy26, "ebitda"), 18000);
  assert.equal(val(fy26, "profit_after_tax"), 9000);
  assert.equal(val(fy24, "profit_before_tax"), -500); // (500)
  assert.equal(val(fy24, "tax_expense"), 0);
});

test("shape A: a 'Balance Sheet' heading row switches the section, and borrowings lines are added", () => {
  const [fy26] = read(STATEMENT_CSV).periods;
  assert.equal(val(fy26, "total_assets"), 200000);
  assert.equal(val(fy26, "total_equity"), 110000);
  assert.equal(val(fy26, "total_debt"), 40000); // 30,000 + 10,000
  assert.equal(fy26.fields.total_debt?.derived?.startsWith("borrowings lines added together"), true);
  assert.equal(val(fy26, "total_liabilities"), 90000); // 45,000 + 45,000
});

test("shape A: each figure names its row", () => {
  const [fy26] = read(STATEMENT_CSV).periods;
  assert.equal(fy26.fields.revenue_from_operations?.source, "row 4 | Revenue from operations | 1,00,000.00");
});

test("shape A: part-year columns are skipped by name, notes columns ignored", () => {
  const r = read(["Particulars,FY26,H1 FY26,9M FY26,Notes", "Revenue,1000,480,730,see note 3", "Profit before tax,100,50,70,", "PAT,80,40,60,", "Total assets,2000,1900,1950,"].join("\n"));
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26"]);
  assert.equal(r.notes.filter((n) => /Skipped column/.test(n)).length, 2);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 1000);
});

test("shape A: quarterly columns become quarters", () => {
  const r = read("Item,Q3 FY26,Q2 FY26\nRevenue,300,290\nPBT,34,31\nPAT,25,23\nTotal Assets,900,880");
  assert.deepEqual(r.periods.map((p) => [p.period_label, p.period_type, p.period_end_date]), [
    ["Q3 FY26", "Q3", "2025-12-31"], ["Q2 FY26", "Q2", "2025-09-30"],
  ]);
  assert.equal(val(r.periods[0], "profit_after_tax"), 25);
});

test("shape A: Excel-style date headings and 'Year ended' headings", () => {
  const r = read("Particulars,Year ended 31 March 2026,Year ended 31 March 2025\nRevenue,1000,900\nPBT,100,80\nPAT,75,60");
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26", "FY25"]);
  const m = read("Particulars,Mar-26,Mar-25\nRevenue,1000,900\nPBT,100,80\nPAT,75,60");
  assert.deepEqual(m.periods.map((p) => p.period_end_date), ["2026-03-31", "2025-03-31"]);
});

test("shape A: a sheet with no period headings still reads, and says to set the period", () => {
  const r = read("Revenue,1000\nPBT,100\nPAT,75\nTotal assets,2000");
  assert.equal(r.periods.length, 1);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 1000);
  assert.match(r.periods[0].notes.join(" "), /could not be read/);
  assert.match(r.notes.join(" "), /No period headings/);
});

test("shape A: blank cells, 'NA' and percentages are left empty, not zero", () => {
  const [p] = read("Particulars,FY26\nRevenue,1000\nPBT,\nPAT,NA\nEBITDA,18.5%\nTotal assets,2000").periods;
  assert.equal(val(p, "revenue_from_operations"), 1000);
  assert.equal(p.fields.profit_before_tax, undefined);
  assert.equal(p.fields.profit_after_tax, undefined);
  assert.equal(p.fields.ebitda, undefined);
});

// ---- shape B: one row per period ---------------------------------------------------------------------------------
test("shape B: one row per period, one column per field", () => {
  const r = read(["Period,Revenue,EBITDA,PBT,PAT,Total Assets,Total Debt,Total Equity", "FY26,1000,200,120,90,2000,400,1100", "FY25,900,180,85,63,1860,410,980"].join("\n"));
  assert.equal(r.layout, "one row per period, one column per field");
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26", "FY25"]);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 1000);
  assert.equal(val(r.periods[0], "total_debt"), 400);
  assert.equal(val(r.periods[1], "profit_after_tax"), 63);
  assert.equal(r.unit.unit, null);
  assert.equal(r.unit.source, "none");
});

test("shape B: Sentinel's own field names, a period_end_date column and a basis column are understood", () => {
  const r = read(["period_label,period_end_date,basis,revenue_from_operations,profit_before_tax,profit_after_tax", "FY26,2026-03-31,standalone,700,95,70"].join("\n"));
  assert.equal(r.periods[0].period_label, "FY26");
  assert.equal(r.periods[0].period_end_date, "2026-03-31");
  assert.equal(r.periods[0].basis, "standalone");
  assert.equal(val(r.periods[0], "profit_after_tax"), 70);
});

// ---- inconsistent and unreadable input --------------------------------------------------------------------------
test("an inconsistent sheet is filled but flagged, with the fields downgraded", () => {
  const [p] = read("Particulars,FY26\nRevenue,1000\nTotal assets,2000\nTotal equity,900\nTotal liabilities,900\nPBT,120\nTax expense,30\nPAT,95").periods;
  assert.ok(p.issues.some((i) => /Balance sheet does not balance/.test(i.message)));
  assert.ok(p.issues.some((i) => /differs from profit before tax - tax \(90\)/.test(i.message)));
  assert.equal(p.fields.total_equity?.confidence, "low");
  assert.equal(p.fields.profit_after_tax?.confidence, "low");
});

test("a sheet that is not a statement is refused in plain words", () => {
  for (const csv of ["", "just one line", "Name,Email\nAsha,a@example.com\nRavi,r@example.com", "a,b\n1,2"]) {
    assert.throws(() => read(csv), (e) => e instanceof AutofillError, csv);
  }
  assert.throws(() => read("Name,Email\nAsha,a@example.com"), /Could not recognise this sheet/);
});

// ---- Excel -------------------------------------------------------------------------------------------------------
async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

test("xlsx: the sheet that looks like a statement is read, dates and formulas included", async () => {
  const buf = await workbook((wb) => {
    const notes = wb.addWorksheet("Read me");
    notes.addRow(["This workbook was prepared by finance."]);
    const ws = wb.addWorksheet("P&L and BS");
    ws.addRow(["Acme Industries - Standalone"]);
    ws.addRow(["(INR in million)"]);
    const header = ws.addRow(["Particulars", new Date(Date.UTC(2026, 2, 1)), new Date(Date.UTC(2025, 2, 1))]);
    header.getCell(2).numFmt = "mmm-yy";
    header.getCell(3).numFmt = "mmm-yy";
    ws.addRow(["Revenue from operations", 10000, 9000]);
    ws.addRow(["Profit before tax", 1200, 850]);
    ws.addRow(["Tax expense", 300, 220]);
    const pat = ws.addRow(["Profit after tax", { formula: "B6-B7", result: 900 }, { formula: "C6-C7", result: 630 }]);
    pat.getCell(1).value = "Profit after tax";
    ws.addRow(["Total assets", 20000, 18600]);
  });
  const { rows, sheetName } = await xlsxToRows(buf);
  assert.equal(sheetName, "P&L and BS");
  const r = autofillFromSheet(rows, { kind: "xlsx" });
  assert.deepEqual(r.periods.map((p) => p.period_label), ["FY26", "FY25"]);
  assert.equal(r.unit.unit, "INR_MILLION");
  assert.equal(r.periods[0].basis, "standalone");
  assert.equal(val(r.periods[0], "revenue_from_operations"), 10000);
  assert.equal(val(r.periods[0], "profit_after_tax"), 900); // the formula's result
  assert.equal(val(r.periods[1], "profit_before_tax"), 850);
});

// ---- the route -----------------------------------------------------------------------------------------------------
const A = randomUUID();
const backend = new FakeBackend();
before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
});
after(() => backend.stop());
beforeEach(() => {
  backend.anthropicCalls = [];
});

async function call(file: Buffer | null, name: string, type: string, extra: Record<string, string> = {}, token: string | null = "tok-a") {
  const form = new FormData();
  if (file) form.append("file", new File([new Uint8Array(file)], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(new Request("http://localhost/api/sentinel/autofill", { method: "POST", headers, body: form }));
  return { status: res.status, json: (await res.json()) as any };
}

test("route: a CSV is read, and the model is never called", async () => {
  const r = await call(Buffer.from(STATEMENT_CSV), "acme.csv", "text/csv");
  assert.equal(r.status, 200);
  assert.equal(r.json.kind, "csv");
  assert.equal(r.json.periods.length, 3);
  assert.equal(r.json.periods[0].fields.revenue_from_operations.value, 100000);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("route: a real PDF is read by rules alone, with the page numbers it used, and the model is never called", async () => {
  const pdf = await makePdf(ANNUAL_REPORT_PAGES);
  const r = await call(pdf, "report.pdf", "application/pdf", { basis: "consolidated" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.kind, "pdf");
  assert.deepEqual(r.json.pages_used, [4, 5, 6]);
  assert.equal(r.json.unit.unit, "INR_CRORE");
  const [cur] = r.json.periods;
  assert.equal(cur.period_label, "FY26");
  assert.equal(cur.fields.revenue_from_operations.value, 1000);
  assert.equal(cur.fields.profit_after_tax.value, 90);
  assert.equal(cur.fields.total_assets.value, 2000);
  assert.equal(cur.fields.cash_from_investing.value, -210);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("route: an .xlsx is read", async () => {
  const buf = await workbook((wb) => {
    const ws = wb.addWorksheet("Statement");
    ws.addRow(["Particulars", "FY26", "FY25"]);
    ws.addRow(["Revenue from operations", 1000, 900]);
    ws.addRow(["Profit before tax", 120, 85]);
    ws.addRow(["Profit after tax", 90, 63]);
    ws.addRow(["Total assets", 2000, 1860]);
  });
  const r = await call(buf, "model.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.kind, "xlsx");
  assert.deepEqual(r.json.periods.map((p: any) => p.period_label), ["FY26", "FY25"]);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("route: a Windows-1252 CSV (Excel's 'CSV (Comma delimited)') is decoded", async () => {
  const csv = "Particulars,FY26\nRevenue (Rs. in lakhs) – net,1000\nPBT,100\nPAT,75\nTotal assets,2000\n";
  const r = await call(Buffer.from(csv, "latin1"), "legacy.csv", "text/csv");
  assert.equal(r.status, 200);
  assert.equal(r.json.periods[0].fields.profit_after_tax.value, 75);
});

test("route: the period type and fiscal-year start the caller names are used", async () => {
  const r = await call(Buffer.from("Item,Dec-25\nRevenue,300\nPBT,30\nPAT,20\nTotal assets,900"), "q.csv", "text/csv", { fy_start_month: "1" });
  assert.equal(r.json.periods[0].period_label, "FY25"); // a calendar-year company: December ends its fiscal year
});

test("route: unreadable, unsupported and unauthenticated requests are refused cleanly", async () => {
  assert.equal((await call(Buffer.from("x"), "a.csv", "text/csv", {}, null)).status, 401);
  assert.equal((await call(null, "x", "x")).status, 400);
  const xls = await call(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), "old.xls", "application/vnd.ms-excel");
  assert.equal(xls.status, 400);
  assert.match(xls.json.error, /Save As \.xlsx or \.csv/);
  assert.equal((await call(Buffer.from([1, 2, 0, 3, 4]), "blob.bin", "application/octet-stream")).status, 400);
  const nothing = await call(Buffer.from("Name,Email\nAsha,a@example.com"), "contacts.csv", "text/csv");
  assert.equal(nothing.status, 422);
  assert.match(nothing.json.error, /Could not recognise this sheet/);
  const scanned = await call(await makeBlankPdf(3), "scan.pdf", "application/pdf");
  assert.equal(scanned.status, 422);
  assert.match(scanned.json.error, /scanned or image-based/);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("route: a PDF with no statement pages says so", async () => {
  const prose = await makePdf([Array.from({ length: 30 }, (_, i) => `Paragraph ${i}: the company continued to invest in its people and customers this year.`)]);
  const r = await call(prose, "letter.pdf", "application/pdf");
  assert.equal(r.status, 422);
  assert.match(r.json.error, /No page of this file looks like a financial statement/);
});

// ---- a unit column ------------------------------------------------------------------------------------------
const UNIT_CSV = (unit: string) =>
  `period,period end date,period type,basis,revenue from operations,profit before tax,profit after tax,unit\nFY26,2026-03-31,FY,standalone,489270,40000,30000,${unit}\nFY25,2025-03-31,FY,standalone,470000,38000,28000,${unit}\n`;

test("a 'unit' column states the unit, so a million-rupee file is not mistaken for crore", () => {
  const r = read(UNIT_CSV("million"));
  assert.equal(r.unit.unit, "INR_MILLION");
  assert.equal(r.unit.source, "sheet");
  assert.match(r.unit.evidence ?? "", /unit column says "million"/);
  assert.equal(r.unit.ambiguous, false);
  assert.equal(val(r.periods[0], "revenue_from_operations"), 489_270); // the figures themselves are untouched: conversion happens on import
});

test("the unit column accepts crore, lakh and the rupee-sign and INR_ spellings; an unknown word is ignored with a note", () => {
  for (const [v, want] of [["crore", "INR_CRORE"], ["₹ crore", "INR_CRORE"], ["lakh", "INR_LAKH"], ["INR_MILLION", "INR_MILLION"], ["Rs million", "INR_MILLION"]] as const) {
    assert.equal(read(UNIT_CSV(v)).unit.unit, want, v);
  }
  const bad = read(UNIT_CSV("furlongs"));
  assert.equal(bad.unit.unit, null);
  assert.match(bad.notes.join(" "), /unit column says "furlongs"/);
});

test("a million-rupee file with a unit column imported into a crore project is converted: 489,270 million is 48,927 crore", async () => {
  const { applyAutofillPeriod } = await import("../../app/sentinel/lib/autofill/apply");
  const r = read(UNIT_CSV("million"));
  const applied = applyAutofillPeriod(r.periods[0], r.unit.unit, "INR_CRORE");
  assert.equal(Number(applied.values.revenue_from_operations), 48_927);
});

test("a file with no unit column and no unit in its text still reports 'not stated', as before", () => {
  const r = read(UNIT_CSV("").replace(",unit", "").replace(/,\n/g, "\n"));
  assert.equal(r.unit.unit, null);
  assert.equal(r.unit.source, "none");
});
