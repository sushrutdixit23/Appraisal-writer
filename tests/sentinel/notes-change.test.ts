// Year-on-year change in the notes. The behaviour under test is the difference between "gone" and "not read".

import test from "node:test";
import assert from "node:assert/strict";
import { serialiseNotes, parseNotes, type AnnualNotes } from "../../app/sentinel/lib/autofill/notes";
import { parseChecks } from "../../app/sentinel/lib/autofill/annualChecks";
import { buildNotesChange, diffNotes, findingKey } from "../../app/sentinel/lib/notesChange";
import { st, ws } from "./helpers";

const W = ws("a", { owner_id: "me", is_public_reference: false, comparison_basis: "consolidated" });
type Read = Partial<AnnualNotes["read"]>;
const R = (r: Read = {}) => ({ ageing: 0, ratios: 0, caro: 0, contingent: 0, maturity: 0, related_parties: 0, ...r });
type F = { note: AnnualNotes["findings"][number]["note"]; id: string; severity: "high" | "medium" | "info"; title: string; page?: number };
const notes = (read: Read, findings: F[] = [], caro_clauses?: AnnualNotes["caro_clauses"]): AnnualNotes => parseNotes(serialiseNotes({ read: R(read), ratios: [], caro_clauses, findings: findings.map((f) => ({ ...f, detail: "as printed", page: f.page ?? 1 })) }))!;
const checks = (opinion: string, findings: { id: string; s?: string; t: string; p?: number }[] = []) => parseChecks(JSON.stringify({ o: opinion, f: findings.map((f) => ({ id: f.id, s: f.s ?? "high", t: f.t, d: "as printed", p: f.p ?? 9 })) }));
const side = (label: string, n: AnnualNotes | null, c: ReturnType<typeof checks> = null) => ({ label, notes: n, checks: c });
const AGE5 = "5.1% of trade receivables has been outstanding over a year past its due date";
const AGE8 = "8.5% of trade receivables has been outstanding over a year past its due date";

test("a finding's identity ignores its figures: the same sentence with a different percentage is the same finding", () => {
  assert.equal(findingKey("ageing_over_1y", AGE5), findingKey("ageing_over_1y", AGE8));
  assert.notEqual(findingKey("ageing_over_1y", AGE5), findingKey("ageing_impaired", AGE5));
  assert.equal(findingKey("contingent", "Contingent liability - tax demands: 506 crore (1,012 crore the year before, -50%)"), findingKey("contingent", "Contingent liability - tax demands: 640 crore (506 crore the year before, +26%)"));
});

test("a figure that moved is 'changed' with both figures; one that did not is counted as unchanged and not listed", () => {
  const prior = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE5, page: 10 }, { note: "ageing", id: "ageing_impaired", severity: "medium", title: "3.4% of trade receivables is marked credit impaired", page: 11 }]);
  const now = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE8, page: 184 }, { note: "ageing", id: "ageing_impaired", severity: "medium", title: "3.4% of trade receivables is marked credit impaired", page: 190 }]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].status, "changed");
  assert.deepEqual(c.items[0].figure, { from: 5.1, to: 8.5 });
  assert.equal([c.items[0].prior_page, c.items[0].page].join("-"), "10-184");
  assert.equal(c.items[0].escalated, false);
  assert.equal(c.unchanged, 1);
});

test("a severity that rose is escalated, even with the figure unchanged", () => {
  const prior = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE8 }]);
  const now = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_over_1y", severity: "high", title: AGE8 }]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.items[0].status, "changed");
  assert.equal(c.items[0].escalated, true);
  assert.equal(c.summary.escalated, 1);
});

test("new needs the note to have been read last year; otherwise it is 'prior_unread', not new", () => {
  const prior = notes({ caro: 5 }); // CARO read, maturity not read
  const now = notes({ caro: 5, maturity: 3 }, [
    { note: "caro", id: "caro_xi", severity: "high", title: "The auditor's CARO answer on fraud is not the clean one (standalone)", page: 437 },
    { note: "maturity", id: "maturity_borrowings", severity: "high", title: "100% of borrowings fall due within a year (33% of the liabilities in the table)", page: 231 },
  ]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  const by = Object.fromEntries(c.items.map((i) => [i.where, i.status]));
  assert.equal(by["Auditor's CARO answers"], "new");
  assert.equal(by["When borrowings fall due"], "prior_unread");
  assert.equal(c.summary.new, 1);
  assert.equal(c.summary.prior_unread, 1);
});

test("resolved needs the note to be read this year; otherwise it is 'now_unread', not resolved", () => {
  const contingent: F = { note: "contingent", id: "contingent", severity: "medium", title: "Contingent liability - tax demands: 506 crore", page: 31 };
  const rpt: F = { note: "related_parties", id: "rpt_exposure", severity: "medium", title: "Loans, deposits and guarantees to related parties in the year: 800 crore (6.0% of net worth)", page: 52 };
  const prior = notes({ contingent: 1, related_parties: 20 }, [contingent, rpt]);
  const now = notes({ contingent: 1 }, []); // contingent read and absent; related parties NOT read this year
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  const by = Object.fromEntries(c.items.map((i) => [i.where, i.status]));
  assert.equal(by["Contingent liabilities"], "resolved");
  assert.equal(by["Related-party transactions"], "now_unread");
  assert.equal(c.items.find((i) => i.status === "now_unread")!.prior_page, 52);
});

test("information-level findings are context, not change", () => {
  const prior = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_long_dated", severity: "info", title: "100% of long-dated receivables" }]);
  const now = notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_long_dated", severity: "info", title: "90% of long-dated receivables" }]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.items.length, 0);
  assert.equal(c.unchanged, 0);
});

test("the same finding on two tables (standalone and consolidated) is matched one to one, not collapsed", () => {
  const a = (p: number) => ({ note: "ageing" as const, id: "ageing_over_1y", severity: "medium" as const, title: AGE5, page: p });
  const prior = notes({ ageing: 2 }, [a(10), a(40)]);
  const now = notes({ ageing: 2 }, [a(12)]); // one of the two is gone
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.unchanged, 1);
  assert.equal(c.items.filter((i) => i.status === "resolved").length, 1);
});

test("CARO clauses compared when both years kept them: worsened, improved, newly read, no longer read; unchanged ones are silent", () => {
  const cl = (id: string, status: "clear" | "adverse" | "read_it", scope: "standalone" | "consolidated" = "standalone") => ({ id, status, page: 400, scope });
  const prior = notes({ caro: 5 }, [], [cl("xi", "clear"), cl("vii", "adverse"), cl("xx", "clear"), cl("ix", "clear")]);
  const now = notes({ caro: 5 }, [], [cl("xi", "adverse"), cl("vii", "clear"), cl("xix", "clear"), cl("ix", "clear")]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.clauses_compared, true);
  assert.deepEqual(c.clauses.map((x) => `${x.clause}:${x.kind}`), ["xi:worsened", "vii:improved", "xix:newly_read", "xx:no_longer_read"]);
});

test("notes stored before clauses were kept cannot be compared clause by clause, and the result says so", () => {
  const prior = notes({ caro: 5 }); // no caro_clauses
  const now = notes({ caro: 5 }, [], [{ id: "xi", status: "adverse", page: 1, scope: "standalone" }]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  assert.equal(c.clauses_compared, false);
  assert.deepEqual(c.clauses, []);
});

test("the auditor's report: an opinion that changed is reported, a new qualification paragraph is a new finding, and an unread report is not a change", () => {
  const c = diffNotes(
    side("FY26", null, checks("qualified", [{ id: "qualified", t: "The auditor has qualified the opinion", p: 9 }])),
    side("FY25", null, checks("unmodified")),
  );
  assert.deepEqual(c.opinion, { from: "unmodified", to: "qualified" });
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].status, "new");
  assert.equal(c.items[0].where, "Auditor's report");
  const unread = diffNotes(side("FY26", null, checks("qualified", [{ id: "qualified", t: "The auditor has qualified the opinion" }])), side("FY25", null, null));
  assert.equal(unread.items[0].status, "prior_unread");
  assert.equal(unread.opinion, null);
});

test("coverage lists which notes were read in which year, and the summary counts agree with the items", () => {
  const prior = notes({ ageing: 1 });
  const now = notes({ ageing: 1, maturity: 4 }, [{ note: "maturity", id: "maturity_borrowings", severity: "high", title: "100% of borrowings fall due within a year" }]);
  const c = diffNotes(side("FY26", now), side("FY25", prior));
  const m = c.coverage.find((x) => x.kind === "maturity")!;
  assert.deepEqual([m.read_prior, m.read_current], [false, true]);
  assert.equal(c.coverage.length, 7); // six notes plus the auditor's report
  assert.equal(c.summary.new + c.summary.resolved + c.summary.changed + c.summary.prior_unread + c.summary.now_unread, c.items.length);
});

test("building from statements: the latest year with notes against the year before on the same basis; one year, or none, says so", () => {
  const stmt = (over = {}) => st("a", { basis: "consolidated", ...over });
  const n = (t: string) => serialiseNotes(notes({ ageing: 1 }, [{ note: "ageing", id: "ageing_over_1y", severity: "medium", title: t }]));
  const both = buildNotesChange(W, [stmt({ period_label: "FY26", period_end_date: "2026-03-31", annual_report_notes: n(AGE8) }), stmt({ period_label: "FY25", period_end_date: "2025-03-31", annual_report_notes: n(AGE5) })]);
  assert.ok(both && both.comparable);
  assert.deepEqual([both.comparable && both.change.current_label, both.comparable && both.change.prior_label], ["FY26", "FY25"]);
  const one = buildNotesChange(W, [stmt({ period_label: "FY26", period_end_date: "2026-03-31", annual_report_notes: n(AGE8) }), stmt({ period_label: "FY25", period_end_date: "2025-03-31" })]);
  assert.ok(one && !one.comparable);
  assert.match(!one.comparable ? one.reason : "", /Only FY26 has annual-report notes.*Import the previous year/);
  assert.equal(buildNotesChange(W, [stmt({ period_label: "FY26", period_end_date: "2026-03-31" })]), null);
  // A standalone year is not the prior of a consolidated one.
  const mixed = buildNotesChange(W, [stmt({ period_label: "FY26", period_end_date: "2026-03-31", annual_report_notes: n(AGE8) }), stmt({ period_label: "FY25 (s)", basis: "standalone", period_end_date: "2025-03-31", annual_report_notes: n(AGE5) })]);
  assert.ok(mixed && !mixed.comparable);
});
