// The auditor's-report checks. Two real reports (TCS and Infosys standalone FY2025-26, three pages each, as pdf-parse reads them) must come out unmodified with nothing
// flagged; the other cases are built in the same layout from the standard wording of each kind of paragraph, because the two real reports have none of them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contingentLeads, parseChecks, runAnnualReportChecks, serialiseChecks, summariseChecks } from "../../app/sentinel/lib/autofill/annualChecks";
import type { PdfPage } from "../../app/sentinel/lib/extraction";

const fixture = (name: string): PdfPage[] => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", name), "utf-8"));

test("TCS's standalone auditor's report (real pages) is read as unmodified, with no emphasis of matter and no going-concern paragraph", () => {
  const r = runAnnualReportChecks(fixture("auditor-report-tcs.json"))!;
  assert.equal(r.opinion, "unmodified");
  assert.deepEqual(r.findings.map((f) => [f.id, f.severity]), [["unmodified", "info"]]);
  assert.deepEqual(r.report_pages, [239, 240, 241]);
  assert.match(summariseChecks(r), /unmodified opinion, no emphasis of matter or going-concern paragraph/);
});

test("Infosys's report (real pages) is read the same way", () => {
  const r = runAnnualReportChecks(fixture("auditor-report-infosys.json"))!;
  assert.equal(r.opinion, "unmodified");
  assert.equal(r.findings.filter((f) => f.severity !== "info").length, 0);
});

const page = (num: number, ...lines: string[]): PdfPage => ({ num, text: lines.join("\n") });
const REPORT = (...middle: string[]) => [
  page(10, "To the Members of", "Acme Limited", "Report on the Audit of the Standalone Financial Statements", ...middle,
    "Basis for Opinion", "We conducted our audit in accordance with the Standards on Auditing specified under section 143(10) of the Act.", "Key Audit Matters", "Revenue recognition is a key audit matter."),
];
const OPINION_CLEAN = ["Opinion", "In our opinion the aforesaid financial statements give a true and fair view of the state of affairs of the Company."];

test("a qualified opinion is found by its heading and its basis is quoted verbatim, high severity", () => {
  const pages = REPORT("Qualified Opinion", "In our opinion, except for the effects of the matter described in the Basis for Qualified Opinion section, the statements give a true and fair view.", "Basis for Qualified Opinion", "The Company has not provided for doubtful advances of Rs 120 crore, which in our opinion should have been provided.");
  const r = runAnnualReportChecks(pages)!;
  assert.equal(r.opinion, "qualified");
  const f = r.findings.find((x) => x.id === "qualified")!;
  assert.equal(f.severity, "high");
  assert.match(f.detail, /not provided for doubtful advances of Rs 120 crore/);
  assert.match(summariseChecks(r), /qualified the opinion.*Read it before relying/);
});

test("adverse and disclaimer opinions outrank a qualification", () => {
  assert.equal(runAnnualReportChecks(REPORT("Adverse Opinion", "In our opinion the statements do not give a true and fair view.", "Basis for Adverse Opinion", "The matters are pervasive."))!.opinion, "adverse");
  assert.equal(runAnnualReportChecks(REPORT("Disclaimer of Opinion", "We do not express an opinion.", "Basis for Disclaimer of Opinion", "We could not obtain sufficient evidence."))!.opinion, "disclaimer");
});

test("an emphasis-of-matter paragraph is medium severity and the opinion stays unmodified; a material uncertainty about going concern is high", () => {
  const eom = runAnnualReportChecks(REPORT(...OPINION_CLEAN, "Emphasis of Matter", "We draw attention to Note 42 which describes the uncertainty relating to the outcome of the pending litigation with the tax authorities. Our opinion is not modified in respect of this matter."))!;
  assert.equal(eom.opinion, "unmodified");
  assert.deepEqual(eom.findings.map((f) => [f.id, f.severity]), [["emphasis", "medium"]]);
  assert.match(eom.findings[0].detail, /We draw attention to Note 42/);
  const gc = runAnnualReportChecks(REPORT(...OPINION_CLEAN, "Material Uncertainty Related to Going Concern", "We draw attention to Note 7: the Company incurred a net loss and its current liabilities exceed its current assets, indicating a material uncertainty that may cast significant doubt on its ability to continue as a going concern."))!;
  assert.deepEqual(gc.findings.map((f) => [f.id, f.severity]), [["going_concern", "high"]]);
});

test("the standard going-concern wording in the auditor's responsibilities is NOT a going-concern finding", () => {
  const pages = REPORT(...OPINION_CLEAN, "Auditor's Responsibilities for the Audit of the Financial Statements", "Conclude on the appropriateness of management's use of the going concern basis of accounting and whether a material uncertainty exists related to events that may cast significant doubt on the Company's ability to continue as a going concern.");
  assert.equal(runAnnualReportChecks(pages)!.findings.some((f) => f.id === "going_concern"), false);
});

test("an 'Other Matter' paragraph is kept as information", () => {
  const r = runAnnualReportChecks(REPORT(...OPINION_CLEAN, "Other Matter", "The financial statements for the year ended 31 March 2025 were audited by another auditor who expressed an unmodified opinion."))!;
  assert.deepEqual(r.findings.map((f) => [f.id, f.severity]), [["other_matter", "info"]]);
});

test("a section ends where the next part of the report starts, so a flagged paragraph never swallows the responsibilities that follow", () => {
  const r = runAnnualReportChecks(REPORT(...OPINION_CLEAN, "Emphasis of Matter", "We draw attention to Note 42.", "Information Other than the Financial Statements and Auditor's Report Thereon", "The Company's Board of Directors is responsible for the other information."))!;
  assert.ok(!/Board of Directors is responsible/.test(r.findings[0].detail));
});

test("no auditor's report in the pages means nothing is said about one - not 'clean'", () => {
  assert.equal(runAnnualReportChecks([page(1, "Revenue from operations  1,000  900")]), null);
});

test("an annexure page ends the report, and a file holding two reports (standalone and consolidated) is read as both", () => {
  const pages = [
    page(10, "Report on the Audit of the Standalone Financial Statements", ...OPINION_CLEAN),
    page(11, "Annexure A to the Independent Auditor's Report", "Emphasis of Matter", "This must not be read."),
    page(20, "Report on the Audit of the Consolidated Financial Statements", "Qualified Opinion", "except for...", "Basis for Qualified Opinion", "A subsidiary's accounts are unaudited."),
  ];
  const r = runAnnualReportChecks(pages)!;
  assert.deepEqual(r.report_pages, [10, 20]);
  assert.ok(!r.findings.some((f) => /must not be read/.test(f.detail)));
  assert.equal(r.opinion, "qualified");
});

test("contingent liabilities: a sentence that states an amount is lifted out verbatim (TCS's real note, where the rupee sign reads as 'H'); policy wording with no amount is not", () => {
  const note = fixture("tcs-tax-contingency-note.json");
  const leads = contingentLeads([...note, page(1, "Contingent liabilities are disclosed when there is a possible obligation arising from past events.")]);
  assert.equal(leads.length, 1);
  assert.match(leads[0].sentence, /Contingent liability in respect of tax demands received from direct tax authorities in India and other jurisdictions is H506 crore and H1,012 crore as at March 31, 2026 and 2025/);
  assert.equal(leads[0].page, note[0].num);
});

test("saved with a statement: it fits the 8,000-character column however long the paragraphs, and reads back to the same opinion and findings", () => {
  const long = "x ".repeat(2000);
  const r = runAnnualReportChecks(REPORT("Qualified Opinion", "except for the matter...", "Basis for Qualified Opinion", long, "Emphasis of Matter", long))!;
  r.findings.push(...Array.from({ length: 6 }, (_, i) => ({ id: "contingent", severity: "info" as const, title: "A contingent liability is stated with an amount", detail: `Sentence ${i} ${long}`.slice(0, 420), page: 5 })));
  const text = serialiseChecks(r);
  assert.ok(text.length <= 8000, String(text.length));
  const back = parseChecks(text)!;
  assert.equal(back.opinion, "qualified");
  assert.ok(back.findings.some((f) => f.id === "qualified" && f.severity === "high"));
  assert.equal(parseChecks("not json"), null);
  assert.equal(parseChecks(null), null);
});

test("through the file reader: a text PDF that holds an auditor's report returns the checks with the result, and a PDF without one returns none", async () => {
  const { makePdf, ANNUAL_REPORT_PAGES } = await import("./pdf-fixtures");
  const { readFileToResult } = await import("../../app/sentinel/lib/autofill/readFile");
  const report = ["To the Members of", "Acme Limited", "Report on the Audit of the Standalone Financial Statements", "Opinion", "In our opinion the financial statements give a true and fair view of the state of affairs of the Company.", "Emphasis of Matter", "We draw attention to Note 42 about pending litigation."];
  const withReport = await readFileToResult(await makePdf([...ANNUAL_REPORT_PAGES, report]), "ar.pdf", "application/pdf", {});
  assert.equal(withReport.annual_report_checks?.opinion, "unmodified");
  assert.deepEqual(withReport.annual_report_checks?.findings.map((f) => f.id), ["emphasis"]);
  assert.match(withReport.notes.join(" "), /Auditor's report: unmodified opinion, with an emphasis-of-matter paragraph worth reading/);
  const without = await readFileToResult(await makePdf(ANNUAL_REPORT_PAGES), "ar.pdf", "application/pdf", {});
  assert.equal(without.annual_report_checks, null);
});
