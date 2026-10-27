// /api/sentinel/extract end to end: a real PDF goes in, pdf-parse reads it, the route picks the statement
// pages, a FAKE model replies, and the route verifies the reply. What is inspected is what the model was
// shown and what the route hands back to the form.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/extract/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";
import { ANNUAL_REPORT_PAGES, makeBlankPdf, makePdf } from "./pdf-fixtures";

const A = randomUUID();
const backend = new FakeBackend();
let annualReport: Buffer;

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  annualReport = await makePdf(ANNUAL_REPORT_PAGES);
});
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.anthropicCalls = [];
});

// What a careful model would return for the consolidated pages, with two figures it should not have
// supplied: total_debt (300 + 100 would have to be added by the model) and ebitda (not printed).
const goodFields = {
  revenue_from_operations: 1000, other_income: 50, total_income: 1050, total_expenses: 900, finance_costs: 20,
  depreciation_amortisation: 60, exceptional_items: 30, profit_before_tax: 120, tax_expense: 30, profit_after_tax: 90,
  total_assets: 2000, current_assets: 800, trade_receivables: 150, inventory: 250, cash_and_equivalents: 90,
  fixed_assets: 1100, total_liabilities: 900, current_liabilities: 450, trade_payables: 180, total_equity: 1100,
  cash_from_operations: 140, cash_from_investing: -210, cash_from_financing: 60, capex: 190,
};
// The exact row each of goodFields was read from, and that row's own printed label - what a model
// complying with rule 8 of the system prompt would return alongside the value. total_debt and
// ebitda (never printed, so never quotable) are deliberately left out of both maps.
const goodQuotes: Record<string, string> = {
  revenue_from_operations: "Revenue from operations                  1,000.00                     900.00",
  other_income: "Other income                             50.00                        45.00",
  total_income: "Total income                             1,050.00                     945.00",
  total_expenses: "Total expenses                           900.00                       860.00",
  finance_costs: "Finance costs                            20.00                        22.00",
  depreciation_amortisation: "Depreciation and amortisation expense    60.00                        58.00",
  exceptional_items: "Exceptional items                        30.00                        0.00",
  profit_before_tax: "Profit before tax                        120.00                       85.00",
  tax_expense: "Tax expense                              30.00                        22.00",
  profit_after_tax: "Profit for the year                      90.00                        63.00",
  total_assets: "Total assets                             2,000.00                     1,850.00",
  current_assets: "Total current assets                     800.00                       760.00",
  trade_receivables: "Trade receivables                        150.00                       140.00",
  inventory: "Inventories                              250.00                       230.00",
  cash_and_equivalents: "Cash and cash equivalents                90.00                        80.00",
  fixed_assets: "Property, plant and equipment            1,100.00                     1,020.00",
  total_liabilities: "Total liabilities                        900.00                       880.00",
  current_liabilities: "Total current liabilities                450.00                       410.00",
  trade_payables: "Trade payables                           180.00                       170.00",
  total_equity: "Total equity                             1,100.00                     980.00",
  cash_from_operations: "Net cash generated from operating activities     140.00      120.00",
  cash_from_investing: "Net cash used in investing activities            (210.00)    (150.00)",
  cash_from_financing: "Net cash from financing activities               60.00       25.00",
  capex: "Purchase of property, plant and equipment        (190.00)    (170.00)",
};
const goodLabels: Record<string, string> = {
  revenue_from_operations: "Revenue from operations", other_income: "Other income", total_income: "Total income",
  total_expenses: "Total expenses", finance_costs: "Finance costs", depreciation_amortisation: "Depreciation and amortisation expense",
  exceptional_items: "Exceptional items", profit_before_tax: "Profit before tax", tax_expense: "Tax expense",
  profit_after_tax: "Profit for the year", total_assets: "Total assets", current_assets: "Total current assets",
  trade_receivables: "Trade receivables", inventory: "Inventories", cash_and_equivalents: "Cash and cash equivalents",
  fixed_assets: "Property, plant and equipment", total_liabilities: "Total liabilities", current_liabilities: "Total current liabilities",
  trade_payables: "Trade payables", total_equity: "Total equity", cash_from_operations: "Net cash generated from operating activities",
  cash_from_investing: "Net cash used in investing activities", cash_from_financing: "Net cash from financing activities", capex: "Purchase of property, plant and equipment",
};
const modelReply = (over: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) =>
  JSON.stringify({
    period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated", unit: "crore",
    fields: { ...goodFields, total_debt: 400, ebitda: 175, ...fields },
    extraction_notes: "Used the year ended 31 March 2026 column.",
    low_confidence_fields: [], field_quotes: goodQuotes, field_labels: goodLabels, ...over,
  });

async function call(file: Buffer | null, opts: { token?: string | null; basis?: string; type?: string; name?: string } = {}) {
  const form = new FormData();
  if (file) form.append("file", new File([new Uint8Array(file)], opts.name ?? "report.pdf", { type: opts.type ?? "application/pdf" }));
  if (opts.basis) form.append("basis", opts.basis);
  const headers: Record<string, string> = {};
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? "tok-a"}`;
  const res = await POST(new Request("http://localhost/api/sentinel/extract", { method: "POST", headers, body: form }));
  return { status: res.status, json: (await res.json()) as any };
}
const prompt = () => backend.anthropicCalls[0]?.messages[0].content as string;

test("an unauthenticated upload is refused and nothing reaches the model", async () => {
  assert.equal((await call(annualReport, { token: null })).status, 401);
  assert.equal((await call(annualReport, { token: "bad" })).status, 401);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("a person who calls the model route too often is told to wait, and others are unaffected", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  for (let i = 0; i < 20; i++) assert.equal((await call(annualReport, { basis: "consolidated" })).status, 200);
  const blocked = await call(annualReport, { basis: "consolidated" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.json.error, /Too many requests/);
  assert.equal(backend.anthropicCalls.length, 20, "the blocked call must not reach the model");
});

test("a file that is not a PDF is refused, whatever it claims to be", async () => {
  assert.equal((await call(null)).status, 400);
  assert.equal((await call(Buffer.from("hello"), { type: "text/plain" })).status, 400);
  const fake = await call(Buffer.from("this is not a pdf at all, just text"), { type: "application/pdf" });
  assert.equal(fake.status, 400);
  assert.match(fake.json.error, /not a PDF/);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("a scanned PDF (no text layer) is refused with an explanation, not read badly", async () => {
  const r = await call(await makeBlankPdf(4));
  assert.equal(r.status, 422);
  assert.match(r.json.error, /scanned or image-based/);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("the model is shown the consolidated statement pages only - not the contents, the narrative, the standalone set or the notes", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const shown = prompt();
  assert.deepEqual(r.json.pages_used, [4, 5, 6]);
  assert.match(shown, /Consolidated Statement of Profit and Loss/);
  assert.match(shown, /Consolidated Balance Sheet/);
  assert.ok(!shown.includes("700.00"), "standalone figure was shown to the model");
  assert.ok(!shown.includes("Directors Report"), "narrative was shown to the model");
  assert.ok(!shown.includes("Note 12"), "notes were shown to the model");
  assert.match(shown, /the company is compared on a consolidated basis/i);
});

test("the prompt tells the model which column, which signs and which basis", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  await call(annualReport, { basis: "consolidated" });
  const system = backend.anthropicCalls[0].system as string;
  assert.match(system, /MOST RECENT period/);
  assert.match(system, /exceptional_items: a loss or expense is POSITIVE/);
  assert.match(system, /Never mix figures from the two/);
  assert.match(system, /do not add figures yourself/);
  assert.match(prompt(), /total_assets/); // the balance-sheet fields the forms now collect are requested
  assert.match(prompt(), /cash_from_operations/);
});

test("the draft comes back with unit, basis, figures and the pages it was read from", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.equal(r.json.unit, "INR_CRORE");
  assert.equal(r.json.unit_source, "page");
  assert.equal(r.json.basis, "consolidated");
  assert.equal(r.json.period_label, "FY26");
  assert.equal(r.json.fields.revenue_from_operations, 1000);
  assert.equal(r.json.fields.cash_from_investing, -210);
  assert.equal(r.json.source_file, "report.pdf");
});

test("a figure the page does not print is marked 'verify' - total_debt (summed by the model) and ebitda (never printed)", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  const r = await call(annualReport, { basis: "consolidated" });
  const low: string[] = r.json.low_confidence_fields;
  assert.ok(low.includes("total_debt"), low.join());
  assert.ok(low.includes("ebitda"), low.join());
  for (const printed of ["revenue_from_operations", "profit_after_tax", "total_assets", "capex", "cash_from_investing"]) {
    assert.ok(!low.includes(printed), `${printed} was printed on the page but was marked low confidence`);
  }
  assert.match(r.json.extraction_notes, /Not found as printed in the text that was read: .*total_debt/);
});

test("a draft that breaks the accounting is flagged with the fields involved, even if the model sounded sure", async () => {
  // PAT 95 where PBT 120 - tax 30 = 90; and total assets that do not equal liabilities + equity.
  backend.anthropicReply = () => ({ text: modelReply({}, { profit_after_tax: 95, total_equity: 900 }) });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.ok(r.json.checks.some((c: string) => /differs from profit before tax - tax \(90\)/.test(c)), r.json.checks.join(" | "));
  assert.ok(r.json.checks.some((c: string) => /Balance sheet does not balance/.test(c)));
  for (const k of ["profit_after_tax", "total_equity", "total_assets"]) assert.ok(r.json.low_confidence_fields.includes(k), k);
});

test("the model's own doubts are kept, and a reply of the wrong shape cannot inject fields", async () => {
  backend.anthropicReply = () => ({
    text: modelReply({ low_confidence_fields: ["inventory", "not_a_field"] }, { workspace_id: "attacker", id: "x", capex: "n/a" }),
  });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.ok(r.json.low_confidence_fields.includes("inventory"));
  assert.ok(!r.json.low_confidence_fields.includes("not_a_field"));
  assert.equal("workspace_id" in r.json.fields, false);
  assert.equal("id" in r.json.fields, false);
  assert.equal("capex" in r.json.fields, false);
  assert.match(r.json.extraction_notes, /not part of the statement/);
});

test("a figure quoted from the wrong row is caught even though its value is printed elsewhere on the page - ungroundedFields alone would miss it", async () => {
  // total_income's value (1,050.00) is real and on the page, but the cited quote is tax expense's
  // row - a figure correctly valued yet attributed to the wrong line, which a page-wide "is this
  // number anywhere" check cannot tell from the real thing.
  backend.anthropicReply = () => ({
    text: modelReply({ field_quotes: { ...goodQuotes, total_income: goodQuotes.tax_expense } }),
  });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.ok(r.json.low_confidence_fields.includes("total_income"), r.json.low_confidence_fields.join());
  assert.ok(!r.json.low_confidence_fields.includes("revenue_from_operations"));
  assert.match(r.json.extraction_notes, /Total income: the figure does not appear in the line it cites/);
});

test("a field with no cited quote at all is marked for review, even though its value is on the page", async () => {
  const quotes = { ...goodQuotes };
  delete quotes.other_income;
  backend.anthropicReply = () => ({ text: modelReply({ field_quotes: quotes }) });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.ok(r.json.low_confidence_fields.includes("other_income"));
  assert.match(r.json.extraction_notes, /Other income: no supporting line was returned for it/);
});

test("each figure comes back with the row it was read from and the page that row is on, so the source can be kept", async () => {
  backend.anthropicReply = () => ({ text: modelReply() });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.equal(r.json.field_sources.revenue_from_operations.page, 5); // consolidated P&L
  assert.match(r.json.field_sources.revenue_from_operations.quote, /Revenue from operations\s+1,000\.00/);
  assert.equal(r.json.field_sources.total_assets.page, 4); // consolidated balance sheet
  assert.equal("total_debt" in r.json.field_sources, false, "a figure the model could not quote has no source");
});

test("figures from the wrong basis are called out in the notes", async () => {
  backend.anthropicReply = () => ({ text: modelReply({ basis: "standalone" }) });
  const r = await call(annualReport, { basis: "consolidated" });
  assert.match(r.json.extraction_notes, /figures are standalone, but this company is compared on a consolidated basis/);
});

test("a reply that is not JSON, or a model failure, is a clean 502 that asks for manual entry", async () => {
  backend.anthropicReply = () => ({ text: "I am unable to help with that." });
  const a = await call(annualReport);
  assert.equal(a.status, 502);
  assert.match(a.json.error, /enter the figures manually/);
  backend.anthropicReply = () => ({ json: { type: "error", error: { type: "overloaded_error", message: "busy" } }, status: 529 });
  const b = await call(annualReport);
  assert.equal(b.status, 502);
});

test("when no page looks like a statement the start of the document is read, and the notes say so", async () => {
  const prose = await makePdf([
    Array.from({ length: 30 }, (_, i) => `Paragraph ${i}: the company continued to invest in its people and its customers this year.`),
    Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 30}: governance and sustainability matters were reviewed by the committee.`),
  ]);
  backend.anthropicReply = () => ({ text: modelReply({}, {}) });
  const r = await call(prose);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.pages_used, []);
  assert.match(r.json.extraction_notes, /No page looked like a financial statement/);
});

test("blob URLs outside the app's own upload folder are refused before anything is fetched", async () => {
  for (const blob_url of [
    "http://169.254.169.254/latest/meta-data/",
    "https://evil.example.com/sentinel-extract/a.pdf",
    "https://abc.public.blob.vercel-storage.com/someone-elses/a.pdf",
    "file:///etc/passwd",
  ]) {
    const res = await POST(
      new Request("http://localhost/api/sentinel/extract", {
        method: "POST",
        headers: { authorization: "Bearer tok-a", "content-type": "application/json" },
        body: JSON.stringify({ blob_url, filename: "x.pdf" }),
      })
    );
    assert.equal(res.status, 400, blob_url);
    assert.match(((await res.json()) as any).error, /not one this app issued/);
  }
  assert.equal(backend.anthropicCalls.length, 0);
});
