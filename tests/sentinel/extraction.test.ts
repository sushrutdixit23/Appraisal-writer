// Document Intelligence helpers, on page text only (no PDF, no model).

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDraft,
  parseBlobUrl,
  parseModelDraft,
  resolveUnit,
  scorePage,
  selectStatementPages,
  ungroundedFields,
  valueAppearsInText,
  type PdfPage,
} from "../../app/sentinel/lib/extraction";
import { ANNUAL_REPORT_PAGES } from "./pdf-fixtures";

const pages: PdfPage[] = ANNUAL_REPORT_PAGES.map((lines, i) => ({ num: i + 1, text: lines.join("\n") }));
const PAGE = { toc: 1, narrative: 2, standalonePl: 3, bs: 4, pl: 5, cf: 6, notes: 7 };

// --- page scoring and selection -----------------------------------------------------------

test("a table of contents and a directors' letter that NAME the statements do not score as statements", () => {
  assert.ok(scorePage(pages[0].text) < 9, `toc scored ${scorePage(pages[0].text)}`);
  assert.ok(scorePage(pages[1].text) < 9, `narrative scored ${scorePage(pages[1].text)}`);
  assert.ok(scorePage(pages[6].text) < 9, `notes scored ${scorePage(pages[6].text)}`);
});

test("the real statement pages score well above the threshold", () => {
  for (const n of [PAGE.standalonePl, PAGE.bs, PAGE.pl, PAGE.cf]) {
    assert.ok(scorePage(pages[n - 1].text) >= 9, `page ${n} scored ${scorePage(pages[n - 1].text)}`);
  }
});

test("selection finds the statement pages, in page order, skipping contents, narrative and notes", () => {
  const sel = selectStatementPages(pages)!;
  assert.deepEqual(sel.pages, [PAGE.standalonePl, PAGE.bs, PAGE.pl, PAGE.cf]);
  assert.ok(!sel.text.includes("Directors Report"));
  assert.ok(!sel.text.includes("Note 12"));
});

test("with a consolidated basis requested, the standalone pages are dropped and the figures cannot mix", () => {
  const sel = selectStatementPages(pages, { preferredBasis: "consolidated" })!;
  assert.deepEqual(sel.pages, [PAGE.bs, PAGE.pl, PAGE.cf]);
  assert.ok(!sel.text.includes("700.00"), "a standalone figure reached the prompt");
  assert.match(sel.notes.join(" "), /other basis were left out/);
});

test("with a standalone basis requested, only the standalone statement (plus untagged pages) remains", () => {
  const sel = selectStatementPages(pages, { preferredBasis: "standalone" })!;
  assert.ok(sel.pages.includes(PAGE.standalonePl));
  assert.ok(!sel.pages.includes(PAGE.pl));
  assert.ok(!sel.pages.includes(PAGE.bs));
});

test("when the requested basis is not in the document, the other basis is read and the note says so", () => {
  const onlyStandalone = pages.filter((p) => p.num === PAGE.standalonePl || p.num === PAGE.toc);
  const sel = selectStatementPages(onlyStandalone, { preferredBasis: "consolidated" })!;
  assert.deepEqual(sel.pages, [PAGE.standalonePl]);
  assert.match(sel.notes.join(" "), /No consolidated statement pages were identified/);
});

test("the unit comes from the statement pages", () => {
  const sel = selectStatementPages(pages, { preferredBasis: "consolidated" })!;
  assert.equal(sel.unit?.unit, "INR_CRORE");
  assert.equal(sel.unit?.ambiguous, false);
});

test("a statement that runs onto a second, heading-less page keeps its continuation", () => {
  const continuation: PdfPage = {
    num: 8,
    text: ["Other comprehensive income    5.00   4.00", "Total comprehensive income    95.00   67.00", "Revenue from operations segment    1,000.00   900.00", "Finance costs    20.00   22.00", "Tax expenses    30.00   22.00"].join("\n"),
  };
  // Placed straight after the consolidated P&L (page 5), the way a long statement continues.
  const withContinuation: PdfPage[] = [
    ...pages.slice(0, PAGE.pl),
    { ...continuation, num: PAGE.pl + 1 },
    ...pages.slice(PAGE.pl).map((p) => ({ ...p, num: p.num + 1 })),
  ];
  const sel = selectStatementPages(withContinuation)!;
  assert.ok(sel.pages.includes(PAGE.pl + 1), `pages ${sel.pages}`);
  assert.ok(!sel.pages.includes(8), "the notes page was pulled in as a continuation");
});

test("a document with no statement pages returns null so the caller can fall back", () => {
  assert.equal(selectStatementPages([pages[0], pages[1], pages[6]]), null);
  assert.equal(selectStatementPages([]), null);
});

test("the character budget drops the lowest-scoring pages first", () => {
  const sel = selectStatementPages(pages, { maxChars: 1500 })!;
  assert.ok(sel.text.length <= 1500 + 400, `${sel.text.length} chars`);
  assert.ok(sel.pages.length < 4);
});

// --- grounding ----------------------------------------------------------------------------------

test("a number is grounded when the page prints it, whatever the separators or sign", () => {
  const text = "Revenue 1,234.50   Loss (56.00)  Total 12,34,567.80";
  assert.ok(valueAppearsInText(1234.5, text));
  assert.ok(valueAppearsInText(-56, text));
  assert.ok(valueAppearsInText(56, text));
  assert.ok(valueAppearsInText(1234567.8, text));
  assert.ok(!valueAppearsInText(1234.51, text));
  assert.ok(!valueAppearsInText(400, text));
});

test("figures the page does not print are reported, so a derived or invented one is marked 'verify'", () => {
  const text = pages.map((p) => p.text).join("\n");
  const missing = ungroundedFields({ revenue_from_operations: 1000, total_debt: 400, ebitda: 175, capex: 190 }, text);
  assert.deepEqual(missing.sort(), ["ebitda", "total_debt"]);
});

// --- the model's reply -------------------------------------------------------------------------

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated", unit: "crore",
    fields: { revenue_from_operations: 1000, profit_after_tax: 90 }, extraction_notes: "current year column",
    low_confidence_fields: ["profit_after_tax"], ...over,
  });

test("a well-formed reply is parsed", () => {
  const { draft, problems } = parseModelDraft(reply());
  assert.deepEqual(problems, []);
  assert.equal(draft.period_type, "FY");
  assert.equal(draft.basis, "consolidated");
  assert.equal(draft.model_unit, "INR_CRORE");
  assert.equal(draft.fields.revenue_from_operations, 1000);
  assert.deepEqual(draft.low_confidence_fields, ["profit_after_tax"]);
});

test("a reply wrapped in a code fence or prose is still read", () => {
  assert.equal(parseModelDraft("```json\n" + reply() + "\n```").draft.period_label, "FY26");
  assert.equal(parseModelDraft("Here is the JSON you asked for:\n" + reply() + "\nHope that helps.").draft.period_label, "FY26");
});

test("a reply with no JSON is an error, not an empty draft", () => {
  assert.throws(() => parseModelDraft("I could not find any statements."));
  assert.throws(() => parseModelDraft("{broken"));
});

test("bad pieces are dropped one by one and reported: wrong enum, impossible date, text where a number belongs, unknown field", () => {
  const { draft, problems } = parseModelDraft(
    reply({
      period_type: "H1", basis: "group", period_end_date: "2026-13-45",
      fields: { revenue_from_operations: "1,000.00", profit_after_tax: "n/a", sales_tax: 5, inventory: { v: 1 } },
      low_confidence_fields: ["inventory", "not_a_field", 7],
    })
  );
  assert.equal(draft.period_type, null);
  assert.equal(draft.basis, null);
  assert.equal(draft.period_end_date, null);
  assert.equal(draft.fields.revenue_from_operations, 1000); // "1,000.00" is a number
  assert.equal(draft.fields.profit_after_tax, undefined);
  assert.equal("sales_tax" in draft.fields, false);
  assert.deepEqual(draft.low_confidence_fields, ["inventory"]);
  assert.equal(problems.length, 3);
});

test("the unit on the statement pages overrides the model's reading, and the disagreement is noted", () => {
  const detected = { unit: "INR_CRORE" as const, evidence: "Rs. in crore", ambiguous: false };
  const r = resolveUnit(detected, "INR_LAKH");
  assert.equal(r.unit, "INR_CRORE");
  assert.equal(r.source, "page");
  assert.match(r.note ?? "", /model read INR_LAKH/);
  assert.equal(resolveUnit(detected, "INR_CRORE").note, null);
});

test("with no unit on the pages the model's reading is used but labelled; with neither there is none", () => {
  const m = resolveUnit(null, "INR_MILLION");
  assert.equal(m.unit, "INR_MILLION");
  assert.equal(m.source, "model");
  assert.match(m.note ?? "", /check it/);
  const n = resolveUnit(null, null);
  assert.equal(n.unit, null);
  assert.equal(n.source, "none");
});

// --- accounting checks over a draft ----------------------------------------------------------

test("a consistent draft raises nothing", () => {
  const issues = checkDraft({
    revenue_from_operations: 1000, other_income: 50, total_income: 1050, total_expenses: 900, exceptional_items: 30,
    profit_before_tax: 120, tax_expense: 30, profit_after_tax: 90,
    total_assets: 2000, total_liabilities: 900, total_equity: 1100, current_assets: 800, current_liabilities: 450,
  });
  assert.deepEqual(issues, []);
});

test("an inconsistent draft names the fields involved, so they can be marked 'verify'", () => {
  const issues = checkDraft({ revenue_from_operations: 1000, profit_before_tax: 120, tax_expense: 30, profit_after_tax: 95 });
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /differs from profit before tax - tax \(90\)/);
  assert.deepEqual(issues[0].fields, ["profit_after_tax", "profit_before_tax", "tax_expense"]);
  const bs = checkDraft({ total_assets: 2000, total_liabilities: 900, total_equity: 900 });
  assert.equal(bs[0].severity, "error");
  assert.deepEqual(bs[0].fields, ["total_assets", "total_liabilities", "total_equity"]);
});

// --- uploaded-file URLs -----------------------------------------------------------------------

test("only blob URLs this app issued are ever fetched", () => {
  const good = "https://abc123.public.blob.vercel-storage.com/sentinel-extract/report-Xy12.pdf";
  assert.ok(parseBlobUrl(good));
  for (const bad of [
    "http://abc123.public.blob.vercel-storage.com/sentinel-extract/a.pdf", // not https
    "https://abc123.public.blob.vercel-storage.com/other-folder/a.pdf",
    "https://abc123.public.blob.vercel-storage.com/sentinel-extract/../secret.pdf".replace("..", "%2e%2e"),
    "https://evil.example.com/sentinel-extract/a.pdf",
    "https://public.blob.vercel-storage.com.evil.example.com/sentinel-extract/a.pdf",
    "https://169.254.169.254/latest/meta-data/",
    "https://user:pw@abc123.public.blob.vercel-storage.com/sentinel-extract/a.pdf",
    "https://abc123.public.blob.vercel-storage.com:8443/sentinel-extract/a.pdf",
    "file:///etc/passwd",
    "not a url",
    "",
    null,
    42,
  ]) {
    assert.equal(parseBlobUrl(bad), null, String(bad));
  }
});
