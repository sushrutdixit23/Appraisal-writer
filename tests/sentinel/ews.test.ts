// The EWS checklist: each indicator's status on hand-built filings. The point under test is the difference between "clear" (read, and absent) and "not read".

import test from "node:test";
import assert from "node:assert/strict";
import { parseNotes, serialiseNotes, type AnnualNotes } from "../../app/sentinel/lib/autofill/notes";
import { buildEws, EWS_THRESHOLDS, type EwsChecklist } from "../../app/sentinel/lib/ews";
import { st, ws } from "./helpers";

const W = ws("a", { owner_id: "me", is_public_reference: false, sector: "technology", comparison_basis: "consolidated" });
const READ0 = { ageing: 0, ratios: 0, caro: 0, contingent: 0, maturity: 0, related_parties: 0 };
type Clause = NonNullable<AnnualNotes["caro_clauses"]>[number];
const clause = (id: string, status: Clause["status"], page = 400): Clause => ({ id, status, page, scope: "standalone" });
const notes = (over: Partial<AnnualNotes> = {}): string => serialiseNotes({ read: { ...READ0, caro: 5 }, findings: [], ratios: [], caro_clauses: [], ...over });
const checks = (opinion: string, findings: { id: string; t?: string; p?: number }[] = []) => JSON.stringify({ o: opinion, f: findings.map((f) => ({ id: f.id, s: "high", t: f.t ?? f.id, d: "as printed", p: f.p ?? 9 })) });
const fy = (over = {}) => st("a", { period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated", ...over });
const item = (c: EwsChecklist, id: string) => c.items.find((i) => i.id === id)!;

test("with no annual statement nothing is tested: what can be read is 'not read', and what cannot be read from filings says so", () => {
  const c = buildEws(W, []);
  assert.equal(c.empty, true);
  assert.equal(item(c, "statutory_dues").status, "not_read");
  assert.equal(item(c, "roc_liabilities").status, "not_readable");
  assert.equal(item(c, "promoter_pledge").status, "not_readable");
  assert.equal(item(c, "poor_disclosure").status, "not_readable");
  assert.equal(c.summary.hit + c.summary.clear, 0);
  assert.equal(Object.values(c.summary).reduce((a, b) => a + b, 0), c.items.length);
});

test("a CARO clause read and clean is clear; adverse is a hit with its page and words; unrecognised wording or an absent clause is NOT clear", () => {
  const n = notes({
    caro_clauses: [clause("vii", "adverse", 437), clause("xi", "clear", 438), clause("ix", "read_it", 439)],
    findings: [{ note: "caro", id: "caro_vii", severity: "high", title: "The auditor's CARO answer on statutory dues is not the clean one", detail: 'Clause (vii): "undisputed statutory dues were outstanding for more than six months"', page: 437 }],
  });
  const c = buildEws(W, [fy({ annual_report_notes: n })]);
  const dues = item(c, "statutory_dues");
  assert.equal(dues.status, "hit");
  assert.deepEqual(dues.evidence.map((e) => e.page), [437]);
  assert.match(dues.evidence[0].text, /undisputed statutory dues/);
  assert.equal(item(c, "caro_fraud").status, "clear");
  assert.equal(item(c, "caro_default").status, "not_read");
  assert.match(item(c, "caro_default").reason, /not recognised/);
  assert.equal(item(c, "caro_cash_losses").status, "not_read"); // clause (xvii) was not in the report at all
  assert.match(item(c, "caro_cash_losses").reason, /not found in the report/);
});

test("notes stored before clauses were kept can show a hit but never a clear", () => {
  const legacy = JSON.stringify({ v: 1, r: { ...READ0, caro: 9 }, f: [{ n: "caro", i: "caro_xi", s: "h", t: "fraud", d: 'Clause (xi): "ADT-4"', p: 12 }], q: [] });
  assert.equal(parseNotes(legacy)!.caro_clauses, undefined);
  const c = buildEws(W, [fy({ annual_report_notes: legacy })]);
  assert.equal(item(c, "caro_fraud").status, "hit");
  assert.equal(item(c, "statutory_dues").status, "not_read");
  assert.match(item(c, "statutory_dues").reason, /Import the annual report again/);
});

test("clause results survive being stored and read back", () => {
  const original: Clause[] = [clause("vii", "clear", 10), clause("xi", "adverse", 11), clause("ix", "read_it", 12)];
  const back = parseNotes(notes({ caro_clauses: original }))!;
  assert.deepEqual(back.caro_clauses, original);
});

test("the auditor's report: a qualified opinion and a going-concern paragraph are hits; an unmodified opinion with neither is clear; an unrecognised one is not read", () => {
  const q = buildEws(W, [fy({ annual_report_checks: checks("qualified", [{ id: "qualified", t: "The auditor has qualified the opinion", p: 9 }, { id: "going_concern", p: 10 }]) })]);
  assert.equal(item(q, "opinion").status, "hit");
  assert.equal(item(q, "opinion").evidence[0].page, 9);
  assert.equal(item(q, "going_concern").status, "hit");
  const clean = buildEws(W, [fy({ annual_report_checks: checks("unmodified") })]);
  assert.equal(item(clean, "opinion").status, "clear");
  assert.equal(item(clean, "going_concern").status, "clear");
  const unknown = buildEws(W, [fy({ annual_report_checks: checks("unknown") })]);
  assert.equal(item(unknown, "opinion").status, "not_read");
  assert.equal(item(buildEws(W, [fy()]), "opinion").status, "not_read"); // no auditor's report on file
});

test("unbilled revenue: growth 20 points past revenue's is a hit against the technology threshold (15), parity is clear, a missing year is not read", () => {
  const p = (u: number, r: number) => fy({ period_label: "FY25", period_end_date: "2025-03-31", unbilled_revenue: u, revenue_from_operations: r });
  const hit = buildEws(W, [fy({ unbilled_revenue: 130, revenue_from_operations: 1100 }), p(100, 1000)]); // 30% against 10%
  assert.equal(item(hit, "unbilled_revenue").status, "hit");
  assert.match(item(hit, "unbilled_revenue").evidence[0].text, /20-point gap against a 15-point threshold/);
  const clear = buildEws(W, [fy({ unbilled_revenue: 110, revenue_from_operations: 1100 }), p(100, 1000)]);
  assert.equal(item(clear, "unbilled_revenue").status, "clear");
  assert.equal(item(buildEws(W, [fy({ unbilled_revenue: 110 })]), "unbilled_revenue").status, "not_read");
  assert.equal(item(buildEws(W, [fy({ unbilled_revenue: 110 }), p(0, 1000)]), "unbilled_revenue").status, "not_read");
});

test("borrowings up while cash is large: both conditions must hold", () => {
  const prior = (debt: number | null) => fy({ period_label: "FY25", period_end_date: "2025-03-31", total_debt: debt });
  const at = (debt: number, cash: number | null, before: number | null = 100) => item(buildEws(W, [fy({ total_debt: debt, cash_and_equivalents: cash }), prior(before)]), "borrowing_despite_cash");
  assert.equal(EWS_THRESHOLDS.debt_growth, 0.1);
  assert.equal(at(120, 70).status, "hit"); // +20%, cash 58% of debt
  assert.equal(at(105, 70).status, "clear"); // +5%
  assert.equal(at(120, 40).status, "clear"); // cash 33% of debt
  assert.equal(at(120, null).status, "not_read");
  assert.equal(at(120, 70, null).status, "not_read");
  assert.equal(at(120, 70, 0).status, "clear"); // no borrowings the year before
});

test("inconsistency: a ratio-check finding is a hit; disclosed ratios that agree with the statements are clear; no ratios read is not read", () => {
  const hit = buildEws(W, [fy({ annual_report_notes: notes({ findings: [{ note: "ratios", id: "ratio_check_current_ratio", severity: "medium", title: "t", detail: "The company reports a current ratio of 2.0; Sentinel computes 1.25", page: 128 }] }) })]);
  assert.equal(item(hit, "inconsistency").status, "hit");
  assert.equal(item(hit, "inconsistency").evidence[0].page, 128);
  const ratios: AnnualNotes["ratios"] = [{ id: "current_ratio", current: 1.25, previous: 1.1, page: 128, basis: "consolidated" }];
  const clear = buildEws(W, [fy({ current_assets: 500, current_liabilities: 400, annual_report_notes: notes({ ratios }) })]);
  assert.equal(item(clear, "inconsistency").status, "clear");
  assert.equal(item(buildEws(W, [fy({ annual_report_notes: notes({ ratios }) })]), "inconsistency").status, "not_read"); // statement lacks current assets
  assert.equal(item(buildEws(W, [fy({ annual_report_notes: notes() })]), "inconsistency").status, "not_read");
});

test("the latest year with notes is the one tested, on the company's own basis; the checklist names the period", () => {
  const old = fy({ period_label: "FY25", period_end_date: "2025-03-31", annual_report_notes: notes({ caro_clauses: [clause("vii", "adverse")], findings: [{ note: "caro", id: "caro_vii", severity: "high", title: "t", detail: "d", page: 1 }] }) });
  const newer = fy({ annual_report_notes: notes({ caro_clauses: [clause("vii", "clear")] }) });
  const c = buildEws(W, [old, newer]);
  assert.equal(c.period_label, "FY26");
  assert.equal(item(c, "statutory_dues").status, "clear");
  const standalone = fy({ basis: "standalone", period_label: "FY26 (standalone)", annual_report_notes: notes({ caro_clauses: [clause("vii", "adverse")] }) });
  assert.equal(buildEws(W, [newer, standalone]).basis, "consolidated");
});

test("every item carries its test and its limit, the RBI-derived group is seven, and the source caveat is stated", () => {
  const c = buildEws(W, [fy()]);
  assert.equal(c.items.filter((i) => i.group === "rbi_list").length, 7);
  assert.ok(c.items.every((i) => i.how.length > 0 && i.limit.length > 0 && i.reason.length > 0));
  assert.ok(c.items.filter((i) => i.status === "not_readable").every((i) => /Cannot be read from/.test(i.reason)));
});
