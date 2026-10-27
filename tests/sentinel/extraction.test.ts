// Document Intelligence helpers, on page text only (no PDF, no model).

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDraft,
  checkGrounding,
  checkGroundingOfField,
  findKeyAuditMattersPages,
  groundingNotes,
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

// --- the auditor's Key Audit Matters ---------------------------------------------------------

const kamPages = (...texts: string[]): PdfPage[] => texts.map((text, i) => ({ num: i + 1, text }));

test("finds the page the heading is on, and no pages at all when it never appears", () => {
  const found = findKeyAuditMattersPages(
    kamPages("Board's report", "Key Audit Matters\nRevenue recognition is a key audit matter.", "Other Information\nBalance Sheet")
  );
  assert.deepEqual(found, [2]);
  assert.deepEqual(findKeyAuditMattersPages(kamPages("Board's report", "Balance Sheet")), []);
  assert.deepEqual(findKeyAuditMattersPages([]), []);
});

test("a table-of-contents or cross-reference line naming the section is not mistaken for the section itself", () => {
  const found = findKeyAuditMattersPages(
    kamPages("Contents\nKey Audit Matters .......... 12", "Independent Auditor's Report\nSome other heading here.\nKey Audit Matters\nRevenue recognition.")
  );
  assert.deepEqual(found, [2]);
});

test("runs onto following pages until the next report section, capped at three pages", () => {
  const threePages = findKeyAuditMattersPages(
    kamPages("Key Audit Matters\nFirst matter: revenue.", "Second matter: goodwill, continued from the page before.", "Other Information\nThe rest of the annual report.")
  );
  assert.deepEqual(threePages, [1, 2]);

  const capped = findKeyAuditMattersPages(kamPages("Key Audit Matters\nA.", "B, more of the same matter.", "C, still going.", "D, a fourth page with no section break."));
  assert.deepEqual(capped, [1, 2, 3]);
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

// --- per-field grounding (the quote itself, not just "the value is somewhere on the page") ----

test("a field is grounded when its quote is on the page, carries the value, and carries the label", () => {
  const text = "Statement of Profit and Loss\nTotal income    1,050.00   900.00\nTax expense    30.00   22.00";
  const flags = checkGroundingOfField(1050, "Total income    1,050.00   900.00", "Total income", text);
  assert.deepEqual(flags, []);
});

test("no quote at all is flagged, distinctly from a quote that fails one of the three checks", () => {
  const text = "Total income    1,050.00   900.00";
  assert.deepEqual(checkGroundingOfField(1050, null, "Total income", text), ["no_quote"]);
  assert.deepEqual(checkGroundingOfField(1050, undefined, "Total income", text), ["no_quote"]);
});

test("a quote not actually present in the text read is flagged, even if it looks plausible", () => {
  const text = "Total income    1,050.00   900.00";
  const flags = checkGroundingOfField(1050, "Total income    1,050.00   900.00 crore", "Total income", text);
  assert.deepEqual(flags, ["quote_not_on_page"]);
});

test("a quote on the page that does not contain the figure's own value is flagged", () => {
  const text = "Total income    1,050.00   900.00\nTax expense    30.00   22.00";
  const flags = checkGroundingOfField(1050, "Tax expense    30.00   22.00", "Tax expense", text);
  assert.deepEqual(flags, ["value_not_in_quote"]);
});

test("a quote that carries the value but not the row's own label is flagged", () => {
  const text = "Total income    1,050.00   900.00";
  const flags = checkGroundingOfField(1050, "Total income    1,050.00   900.00", "Other income", text);
  assert.deepEqual(flags, ["label_not_in_quote"]);
});

test("matching ignores whitespace differences and case", () => {
  const text = "Total   income\n1,050.00";
  const flags = checkGroundingOfField(1050, "Total income 1,050.00", "TOTAL INCOME", text);
  assert.deepEqual(flags, []);
});

test("checkGrounding runs every field and only reports the ones with flags", () => {
  const text = "Total income    1,050.00   900.00\nTax expense    30.00   22.00";
  const grounding = checkGrounding(
    { total_income: 1050, tax_expense: 30, profit_after_tax: 90 },
    { total_income: "Total income    1,050.00   900.00", tax_expense: "Tax expense    30.00   22.00" },
    { total_income: "Total income", tax_expense: "Tax expense" },
    text
  );
  assert.deepEqual(Object.keys(grounding), ["profit_after_tax"]);
  assert.deepEqual(grounding.profit_after_tax, ["no_quote"]);
});

test("groundingNotes writes one sentence per flagged field, naming the field's own label and the worst reason", () => {
  const notes = groundingNotes((key) => (key === "profit_after_tax" ? "Profit after tax" : key), {
    profit_after_tax: ["no_quote"],
    total_income: ["quote_not_on_page", "value_not_in_quote"],
  });
  assert.deepEqual(notes.sort(), [
    "Profit after tax: no supporting line was returned for it.",
    "total_income: the line it cites could not be found in the text read.",
  ]);
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

test("field_quotes and field_labels are read per field, and a reply that omits them leaves both empty", () => {
  const withQuotes = parseModelDraft(
    reply({ field_quotes: { revenue_from_operations: "Revenue from operations    1,000.00" }, field_labels: { revenue_from_operations: "Revenue from operations" } })
  ).draft;
  assert.equal(withQuotes.field_quotes.revenue_from_operations, "Revenue from operations    1,000.00");
  assert.equal(withQuotes.field_labels.revenue_from_operations, "Revenue from operations");
  const without = parseModelDraft(reply()).draft;
  assert.deepEqual(without.field_quotes, {});
  assert.deepEqual(without.field_labels, {});
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
