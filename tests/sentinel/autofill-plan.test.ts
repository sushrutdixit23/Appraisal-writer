// planImport: what the Import page does with the periods that files held, before anything is saved.

import test from "node:test";
import assert from "node:assert/strict";
import { planImport, summariseImport, type ExistingPeriod, type ImportFile } from "../../app/sentinel/lib/autofill/plan";
import type { AutofillPeriod, AutofillResult, FieldHit } from "../../app/sentinel/lib/autofill/types";

const hit = (value: number, extra: Partial<FieldHit> = {}): FieldHit => ({ value, source: "row 3 | x", confidence: "high", ...extra });

function period(over: Partial<AutofillPeriod> & { fields?: Record<string, FieldHit> } = {}): AutofillPeriod {
  return {
    key: "2026-03-31",
    period_type: "FY",
    period_label: "FY26",
    period_end_date: "2026-03-31",
    basis: "consolidated",
    fields: { revenue_from_operations: hit(1000), profit_before_tax: hit(100), profit_after_tax: hit(80) },
    notes: [],
    issues: [],
    ...over,
  } as AutofillPeriod;
}

const file = (name: string, periods: AutofillPeriod[], unit: ImportFile["unit"] = "INR_CRORE"): ImportFile => ({
  name,
  unit,
  result: { kind: "csv", unit: { unit, source: "sheet", evidence: null, ambiguous: false }, periods, notes: [], pages_used: [], layout: null, source_file: name, key_audit_matters_text: null, annual_report_checks: null, annual_report_notes: null } as AutofillResult,
});

const ws = { currency_unit: "INR_CRORE", comparison_basis: "consolidated" as const, fiscal_year_start_month: 4 };
const existing = (over: Partial<ExistingPeriod> = {}): ExistingPeriod => ({
  id: "e1", period_type: "FY", period_label: "FY25", period_end_date: "2025-03-31", basis: "consolidated", revenue_from_operations: 900, ...over,
});

test("a file of new periods imports each one, newest first, all ticked", () => {
  const rows = planImport(
    [file("a.csv", [period({ key: "k25", period_label: "FY25", period_end_date: "2025-03-31" }), period()])],
    ws,
    []
  );
  assert.deepEqual(rows.map((r) => r.period_label), ["FY26", "FY25"]);
  assert.ok(rows.every((r) => r.status === "new" && r.selectedByDefault && r.statement));
  assert.equal(rows[0].statement!.revenue_from_operations, 1000);
  assert.equal(rows[0].statement!.source_file, "a.csv");
  assert.match(rows[0].statement!.extraction_notes ?? "", /no AI/);
});

test("a period already on file is a replace, and is NOT ticked by default", () => {
  const [row] = planImport([file("a.csv", [period({ period_label: "FY25", period_end_date: "2025-03-31" })])], ws, [existing()]);
  assert.equal(row.status, "replace");
  assert.equal(row.selectedByDefault, false);
  assert.ok(row.statement);
});

test("the same label on the other basis is a different period, not a replace", () => {
  const [row] = planImport([file("a.csv", [period({ period_label: "FY25", period_end_date: "2025-03-31", basis: "standalone" })])], ws, [existing()]);
  assert.equal(row.status, "new");
});

test("a label already on file as a different period type is blocked, as the save route would", () => {
  const [row] = planImport([file("a.csv", [period({ period_label: "FY25", period_end_date: "2025-03-31" })])], ws, [existing({ period_type: "Q1" })]);
  assert.equal(row.status, "blocked");
  assert.match(row.errors[0], /already on file as Q1/);
});

test("figures are converted from the file's unit to the project's unit", () => {
  const [row] = planImport([file("lakh.csv", [period({ fields: { revenue_from_operations: hit(100000), profit_before_tax: hit(10000), profit_after_tax: hit(8000) } })], "INR_LAKH")], ws, []);
  assert.equal(row.statement!.revenue_from_operations, 1000); // 1,00,000 lakh = 1,000 crore
  assert.equal(row.statement!.profit_after_tax, 80);
  assert.match(row.notes.join(" "), /converted/);
});

test("a period that cannot be identified is blocked with the reason, not guessed", () => {
  const [noEnd] = planImport([file("a.csv", [period({ period_end_date: null })])], ws, []);
  assert.equal(noEnd.status, "blocked");
  assert.match(noEnd.errors[0], /period end date/);

  const [noType] = planImport([file("a.csv", [period({ period_type: null, period_label: null })])], ws, []);
  assert.equal(noType.status, "blocked");
  assert.match(noType.errors[0], /period type/);
});

test("a year with an end date but no printed label is named FY<year>", () => {
  const [row] = planImport([file("a.csv", [period({ period_label: null })])], ws, []);
  assert.equal(row.status, "new");
  assert.equal(row.period_label, "FY26");
});

test("a missing basis falls back to the project's basis, with a note saying so", () => {
  const [row] = planImport([file("a.csv", [period({ basis: null })])], { ...ws, comparison_basis: "standalone" }, []);
  assert.equal(row.basis, "standalone");
  assert.match(row.notes.join(" "), /does not say whether/);
});

test("a column with no figures, and one that fails the accounting checks, are blocked with reasons", () => {
  const [empty] = planImport([file("a.csv", [period({ fields: {} })])], ws, []);
  assert.equal(empty.status, "blocked");
  assert.match(empty.errors[0], /No figures/);

  const [unbalanced] = planImport(
    [file("a.csv", [period({ fields: { revenue_from_operations: hit(1000), profit_before_tax: hit(100), profit_after_tax: hit(80), total_assets: hit(500), total_liabilities: hit(100), total_equity: hit(100) } })])],
    ws,
    []
  );
  assert.equal(unbalanced.status, "blocked");
  assert.match(unbalanced.errors.join(" "), /does not balance/);
});

test("the same period in two files keeps the one with more figures and shows the other", () => {
  const rich = period({ fields: { revenue_from_operations: hit(1000), profit_before_tax: hit(100), profit_after_tax: hit(80), ebitda: hit(150), total_assets: hit(2000) } });
  const thin = period();
  const rows = planImport([file("thin.csv", [thin]), file("rich.pdf", [rich])], ws, []);
  const kept = rows.find((r) => r.status === "new")!;
  const dropped = rows.find((r) => r.status === "duplicate")!;
  assert.equal(kept.file, "rich.pdf");
  assert.equal(dropped.file, "thin.csv");
  assert.equal(dropped.statement, null);
  assert.match(dropped.errors[0], /rich\.pdf also has FY26/);
});

test("derived and low-confidence figures are counted for the person to verify", () => {
  const [row] = planImport(
    [file("a.csv", [period({ fields: { revenue_from_operations: hit(1000), profit_before_tax: hit(100), profit_after_tax: hit(80, { confidence: "low" }), ebitda: hit(150, { derived: "PBT + finance costs + D&A" }) } })])],
    ws,
    []
  );
  assert.equal(row.toVerify, 2);
  // ...and the saved notes carry it, because an import has no form to show the captions in.
  assert.match(row.statement!.extraction_notes ?? "", /EBITDA was worked out \(PBT \+ finance costs \+ D&A\)/);
  assert.match(row.statement!.extraction_notes ?? "", /Profit after tax was read with low confidence/);
});

test("summary line counts what will be saved and what will not", () => {
  const rows = planImport([file("a.csv", [period(), period({ period_label: "FY25", period_end_date: "2025-03-31" }), period({ key: "bad", period_label: "FY24", period_end_date: null })])], ws, [existing()]);
  const selected = new Set(rows.filter((r) => r.selectedByDefault).map((r) => r.id));
  assert.equal(summariseImport(rows, selected), "1 new; 2 not imported");
  const all = new Set(rows.map((r) => r.id));
  assert.equal(summariseImport(rows, all), "1 new, 1 replacing what is on file; 1 not imported");
});

// ---- what the auditor's report and Key Audit Matters belong to ----------------------------------------------------------------

test("the auditor's-report checks and the Key Audit Matters are saved with the audited year, never with a quarter read from the same file", () => {
  const checks = { opinion: "qualified" as const, findings: [{ id: "qualified", severity: "high" as const, title: "The auditor has qualified the opinion", detail: "Advances of Rs 120 crore were not provided for.", page: 9 }], report_pages: [9], contingent: [] };
  const f = file("report.pdf", [period(), period({ key: "q", period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30" })]);
  f.result = { ...f.result, kind: "pdf", key_audit_matters_text: "Revenue recognition", annual_report_checks: checks };
  const rows = planImport([f], ws, []);
  const fy = rows.find((r) => r.period_type === "FY")!.statement!;
  const q = rows.find((r) => r.period_type === "Q2")!.statement!;
  assert.equal(fy.key_audit_matters_text, "Revenue recognition");
  assert.match(fy.annual_report_checks ?? "", /"o":"qualified"/);
  assert.equal(q.key_audit_matters_text, null);
  assert.equal(q.annual_report_checks, null);
});

test("the notes read from an annual report belong to the audited year, never to a quarter read from the same file", () => {
  const f = file("report.pdf", [period(), period({ key: "q", period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30" })]);
  f.result = { ...f.result, kind: "pdf", annual_report_notes: { findings: [{ note: "caro", id: "caro_xi", severity: "high", title: "Fraud", detail: "x", page: 437 }], read: { ageing: 1, ratios: 0, caro: 1, contingent: 0, maturity: 0, related_parties: 0 }, ratios: [] } };
  const rows = planImport([f], ws, []);
  assert.match(rows.find((r) => r.period_type === "FY")!.statement!.annual_report_notes ?? "", /"i":"caro_xi"/);
  assert.equal(rows.find((r) => r.period_type === "Q2")!.statement!.annual_report_notes, null);
});
