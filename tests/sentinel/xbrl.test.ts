// The XBRL reader, against an instance document built to the XBRL 2.1 standard (contexts carrying dates, facts carrying contextRef and unitRef).
// It is NOT a real NSE or BSE file - none was available - so these tests prove the reader follows the standard, not that an exchange's own tag
// names are all known. The unrecognised-tag note is how a real file will show what to add.

import test from "node:test";
import assert from "node:assert/strict";
import { autofillFromXbrl, looksLikeXbrl } from "../../app/sentinel/lib/autofill/xbrl";
import { readFileToResult, ReadFileError, sniff } from "../../app/sentinel/lib/autofill/readFile";
import { AutofillError } from "../../app/sentinel/lib/autofill/types";

const dur = (id: string, s: string, e: string, extra = "") => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.bseindia.com">500001</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:startDate>${s}</xbrli:startDate><xbrli:endDate>${e}</xbrli:endDate></xbrli:period></xbrli:context>`;
const inst = (id: string, d: string) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.bseindia.com">500001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>${d}</xbrli:instant></xbrli:period></xbrli:context>`;
const fact = (name: string, ctx: string, v: number | string) => `<in-bse-fin:${name} contextRef="${ctx}" unitRef="INR" decimals="2">${v}</in-bse-fin:${name}>`;

/** Acme, Q2 FY27 consolidated, figures in crore. Q2 FY27 / Q1 FY27 / Q2 FY26 durations, a six-month YTD (not stored), a segment breakdown (ignored), two balance-sheet dates. */
function instance(opts: { unitText?: string | null; scale?: number; basisText?: string | null } = {}): string {
  const k = opts.scale ?? 1;
  const f = (n: number) => n * k;
  const unitText = opts.unitText === undefined ? "Crores" : opts.unitText;
  const basisText = opts.basisText === undefined ? "Consolidated" : opts.basisText;
  return `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin/2020-03-31/in-bse-fin" xmlns:link="http://www.xbrl.org/2003/linkbase">
  <!-- a comment with <angle> brackets that must not be read as a fact -->
  ${dur("OneD", "2026-07-01", "2026-09-30")}
  ${dur("TwoD", "2026-04-01", "2026-06-30")}
  ${dur("ThreeD", "2025-07-01", "2025-09-30")}
  ${dur("FourD", "2026-04-01", "2026-09-30")}
  ${dur("SixD", "2025-04-01", "2026-03-31")}
  ${dur("SegA", "2026-07-01", "2026-09-30", '<xbrli:segment><xbrldi:explicitMember dimension="in-bse-fin:SegmentsAxis">in-bse-fin:SegmentAMember</xbrldi:explicitMember></xbrli:segment>')}
  ${inst("InstOne", "2026-09-30")}
  ${inst("InstTwo", "2026-03-31")}
  ${inst("InstOld", "2025-09-30")}
  <xbrli:unit id="INR"><xbrli:measure>iso4217:INR</xbrli:measure></xbrli:unit>
  ${basisText == null ? "" : `<in-bse-fin:NatureOfReportStandaloneConsolidated contextRef="OneD">${basisText}</in-bse-fin:NatureOfReportStandaloneConsolidated>`}
  ${unitText == null ? "" : `<in-bse-fin:LevelOfRoundingUsedInFinancialStatements contextRef="OneD">${unitText}</in-bse-fin:LevelOfRoundingUsedInFinancialStatements>`}
  <in-bse-fin:NameOfCompany contextRef="OneD">Acme Services Ltd</in-bse-fin:NameOfCompany>
  ${fact("RevenueFromOperations", "OneD", f(1100))}${fact("OtherIncome", "OneD", f(20))}${fact("Income", "OneD", f(1120))}${fact("Expenses", "OneD", f(920))}
  ${fact("FinanceCosts", "OneD", f(10))}${fact("DepreciationDepletionAndAmortisationExpense", "OneD", f(40))}${fact("ProfitBeforeTax", "OneD", f(200))}${fact("TaxExpense", "OneD", f(50))}${fact("ProfitLossForPeriod", "OneD", f(150))}
  ${fact("RevenueFromOperations", "TwoD", f(1050))}${fact("ProfitBeforeTax", "TwoD", f(195))}${fact("ProfitLossForPeriod", "TwoD", f(146))}
  ${fact("RevenueFromOperations", "ThreeD", f(1000))}${fact("ProfitBeforeTax", "ThreeD", f(180))}${fact("ProfitLossForPeriod", "ThreeD", f(135))}
  ${fact("RevenueFromOperations", "FourD", f(2150))}${fact("ProfitLossForPeriod", "FourD", f(296))}
  ${fact("RevenueFromOperations", "SegA", f(600))}
  ${fact("RevenueFromOperations", "SixD", f(4100))}${fact("ProfitBeforeTax", "SixD", f(760))}${fact("ProfitLossForPeriod", "SixD", f(570))}
  ${fact("Assets", "InstOne", f(5000))}${fact("CurrentAssets", "InstOne", f(2000))}${fact("Equity", "InstOne", f(3000))}${fact("CurrentLiabilities", "InstOne", f(1000))}${fact("TradeReceivablesCurrent", "InstOne", f(600))}
  ${fact("Assets", "InstTwo", f(4800))}${fact("Equity", "InstTwo", f(2900))}
  ${fact("Assets", "InstOld", f(4000))}
  ${fact("SomeCompanySpecificMeasure", "OneD", 7)}
</xbrli:xbrl>`;
}

const val = (r: ReturnType<typeof autofillFromXbrl>, label: string, field: string) => (r.periods.find((p) => p.period_label === label)?.fields as Record<string, { value: number }> | undefined)?.[field]?.value;

test("periods come from the contexts' own dates: Q2 FY27, Q1 FY27, Q2 FY26 and FY26 are read; the six-month year-to-date is skipped and said so", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  assert.deepEqual(r.periods.map((p) => p.period_label).sort(), ["FY26", "Q1 FY27", "Q2 FY26", "Q2 FY27"]);
  assert.equal(r.kind, "xbrl");
  assert.match(r.notes.join(" "), /Skipped periods of other lengths \(2026-04-01 to 2026-09-30\)/);
  assert.deepEqual(r.periods.map((p) => p.period_end_date), ["2026-09-30", "2026-06-30", "2026-03-31", "2025-09-30"]);
});

test("figures land on the right line and period: revenue, other income, expenses, PBT, tax and PAT for the quarter; the segment breakdown is ignored", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  assert.equal(val(r, "Q2 FY27", "revenue_from_operations"), 1100); // not the 600 of the segment context, not the 2,150 six-month figure
  assert.equal(val(r, "Q2 FY27", "other_income"), 20);
  assert.equal(val(r, "Q2 FY27", "total_expenses"), 920);
  assert.equal(val(r, "Q2 FY27", "finance_costs"), 10);
  assert.equal(val(r, "Q2 FY27", "depreciation_amortisation"), 40);
  assert.equal(val(r, "Q2 FY27", "profit_before_tax"), 200);
  assert.equal(val(r, "Q2 FY27", "tax_expense"), 50);
  assert.equal(val(r, "Q2 FY27", "profit_after_tax"), 150);
  assert.equal(val(r, "Q1 FY27", "revenue_from_operations"), 1050);
  assert.equal(val(r, "Q2 FY26", "profit_after_tax"), 135);
});

test("a balance sheet is an instant: it attaches to the year ending that day, else the quarter, and one with no profit-and-loss period is left out", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  assert.equal(val(r, "Q2 FY27", "total_assets"), 5000);
  assert.equal(val(r, "Q2 FY27", "trade_receivables"), 600);
  assert.equal(val(r, "FY26", "total_assets"), 4800); // 31 March 2026 closes the year
  assert.equal(val(r, "Q2 FY26", "total_assets"), 4000);
  assert.equal(val(r, "Q1 FY27", "total_assets"), undefined); // nothing is dated 30 June
});

test("every figure carries its tag and context as the source, as filed (high confidence), and the accounting checks still run", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  const hit = r.periods.find((p) => p.period_label === "Q2 FY27")!.fields.revenue_from_operations!;
  assert.equal(hit.confidence, "high");
  assert.match(hit.source, /XBRL in-bse-fin:RevenueFromOperations \| context OneD \(2026-07-01 to 2026-09-30\)/);
  const bad = autofillFromXbrl(instance().replace(fact("ProfitLossForPeriod", "OneD", 150), fact("ProfitLossForPeriod", "OneD", 190)), { fyStartMonth: 4 });
  assert.ok(bad.periods.find((p) => p.period_label === "Q2 FY27")!.issues.length > 0, "PAT above PBT is an accounting issue");
});

test("basis and unit are read from the filer's own text facts; with neither, the basis comes from the project and plain-rupee amounts are recognised", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  assert.equal(r.periods[0].basis, "consolidated");
  assert.equal(r.unit.unit, "INR_CRORE");
  assert.match(r.unit.evidence ?? "", /LevelOfRoundingUsedInFinancialStatements: "Crores"/);
  const bare = autofillFromXbrl(instance({ unitText: null, basisText: null, scale: 1e7 }), { fyStartMonth: 4, preferredBasis: "standalone" });
  assert.equal(bare.periods[0].basis, "standalone");
  assert.match(bare.notes.join(" "), /does not say whether it is standalone or consolidated/);
  assert.deepEqual([bare.unit.unit, bare.unit.ambiguous], ["INR", true]);
  const small = autofillFromXbrl(instance({ unitText: null }), { fyStartMonth: 4 });
  assert.equal(small.unit.unit, null); // revenue 1,100 with no unit stated: could be anything, so not guessed
});

test("numeric tags that are not recognised are listed, so a real file shows what to add", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 4 });
  assert.match(r.notes.join(" "), /1 other numeric tags were not recognised \(SomeCompanySpecificMeasure\)/);
});

test("a company whose year starts in January gets calendar quarters", () => {
  const r = autofillFromXbrl(instance(), { fyStartMonth: 1 });
  assert.ok(r.periods.some((p) => p.period_label === "Q3 FY26" && p.period_end_date === "2026-09-30"));
});

test("a file that is not XBRL, or has nothing recognisable, is refused with the reason", () => {
  assert.equal(looksLikeXbrl("<html><body>hi</body></html>"), false);
  assert.throws(() => autofillFromXbrl("<?xml version='1.0'?><note>hello</note>", {}), (e: unknown) => e instanceof AutofillError && /not an XBRL instance/.test(e.message));
  const empty = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance">${dur("A", "2026-07-01", "2026-09-30")}<x:Weird xmlns:x="u" contextRef="A">5</x:Weird></xbrli:xbrl>`;
  assert.throws(() => autofillFromXbrl(empty, {}), /None of the numeric facts/);
});

test("through the file reader: an .xml file is recognised by its content, whatever its name or mime type, and plain XML is not mistaken for it", async () => {
  const buf = Buffer.from(instance());
  assert.equal(sniff(buf, "results.xml", "text/xml"), "xbrl");
  assert.equal(sniff(buf, "download.bin", "application/octet-stream"), "xbrl");
  const r = await readFileToResult(buf, "TCS_results.xml", "text/xml", { fyStartMonth: 4 });
  assert.equal(r.kind, "xbrl");
  assert.equal(r.source_file, "TCS_results.xml");
  await assert.rejects(() => readFileToResult(Buffer.from("<?xml version='1.0'?><note>hello</note>"), "x.xml", "text/xml", {}), (e: unknown) => e instanceof ReadFileError && e.status === 400);
});
