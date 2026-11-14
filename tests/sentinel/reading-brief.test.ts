// The reading brief: the order worked on paper, the reasons printed, the cap, and what was not read.

import test from "node:test";
import assert from "node:assert/strict";
import { serialiseNotes, type AnnualNotes } from "../../app/sentinel/lib/autofill/notes";
import { BRIEF_LIMIT, buildReadingBrief } from "../../app/sentinel/lib/readingBrief";
import { st, ws } from "./helpers";

const W = ws("a", { owner_id: "me", is_public_reference: false, comparison_basis: "consolidated" });
type F = { note: AnnualNotes["findings"][number]["note"]; id: string; severity: "high" | "medium" | "info"; title: string; page: number };
const notes = (read: Partial<AnnualNotes["read"]>, findings: F[], caro_clauses: AnnualNotes["caro_clauses"] = []) =>
  serialiseNotes({ read: { ageing: 0, ratios: 0, caro: 0, contingent: 0, maturity: 0, related_parties: 0, ...read }, ratios: [], caro_clauses, findings: findings.map((f) => ({ ...f, detail: "as printed" })) });
const fy = (label: string, end: string, n: string | null, over = {}) => st("a", { period_label: label, period_end_date: end, basis: "consolidated", annual_report_notes: n, ...over });
const AGE = (pct: string) => `${pct}% of trade receivables has been outstanding over a year past its due date`;
const FRAUD = "The auditor's CARO answer on fraud is not the clean one (standalone)";
const DUES = "The auditor's CARO answer on statutory dues is not the clean one (standalone)";

test("no annual statement: no brief; statements but no report read: it says so and lists nothing", () => {
  assert.equal(buildReadingBrief(W, []), null);
  const b = buildReadingBrief(W, [fy("FY26", "2026-03-31", null)])!;
  assert.equal(b.items.length, 0);
  assert.match(b.headline, /no annual report has been read/);
  assert.match(b.not_read.join(" "), /blind spot, not clean/);
});

test("the order is the stated points: a new medium (1+2) goes above an old high (3) only when it has more points; ties keep the readers' order", () => {
  const prior = fy("FY25", "2025-03-31", notes({ ageing: 1, caro: 5 }, [{ note: "caro", id: "caro_vii", severity: "high", title: DUES, page: 420 }, { note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE("5.1"), page: 170 }]));
  const now = fy("FY26", "2026-03-31", notes({ ageing: 1, caro: 5 }, [
    { note: "caro", id: "caro_vii", severity: "high", title: DUES, page: 436 }, // old high: 3
    { note: "caro", id: "caro_xi", severity: "high", title: FRAUD, page: 437 }, // new high: 3 + 2 = 5
    { note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE("8.5"), page: 184 }, // medium, figure moved but not escalated: 1
  ]));
  const b = buildReadingBrief(W, [now, prior])!;
  assert.deepEqual(b.items.map((i) => [i.rank, i.title, i.points]), [[1, FRAUD, 5], [2, DUES, 3], [3, AGE("8.5"), 1]]);
  assert.deepEqual(b.items[0].reasons, ["High severity", "New this year (not in FY25)"]);
  assert.deepEqual(b.items[1].reasons, ["High severity"]);
  assert.equal(b.items[0].page, 437);
  assert.match(b.headline, /^3 findings to read first, 3 with a page to open/);
});

test("worse than last year adds a point and says so; an early-warning hit adds nothing, because the checklist is built from the same finding", () => {
  const prior = fy("FY25", "2025-03-31", notes({ ageing: 1, caro: 5 }, [{ note: "ageing", id: "ageing_over_1y", severity: "medium", title: AGE("8.5"), page: 170 }], [{ id: "vii", status: "clear", page: 420, scope: "standalone" }]));
  const now = fy("FY26", "2026-03-31", notes({ ageing: 1, caro: 5 }, [
    { note: "ageing", id: "ageing_over_1y", severity: "high", title: AGE("8.5"), page: 184 }, // severity rose: 3 + 1
    { note: "caro", id: "caro_vii", severity: "high", title: DUES, page: 436 }, // new: 3 + 2; the statutory-dues indicator is also hit on p.436 and adds nothing
  ], [{ id: "vii", status: "adverse", page: 436, scope: "standalone" }]));
  const b = buildReadingBrief(W, [now, prior])!;
  const dues = b.items.find((i) => i.title === DUES)!, age = b.items.find((i) => i.title === AGE("8.5"))!;
  assert.equal(dues.points, 5);
  assert.deepEqual(dues.reasons, ["High severity", "New this year (not in FY25)"]);
  assert.equal(age.points, 4);
  assert.ok(age.reasons.includes("Worse than last year"));
  assert.equal(b.items[0].title, DUES);
});

test("the list is capped and says how many more there are; information findings never appear", () => {
  const many: F[] = Array.from({ length: 8 }, (_, i) => ({ note: "contingent" as const, id: "contingent", severity: "medium" as const, title: `Contingent liability - matter ${i}: ${100 + i} crore`, page: 30 + i }));
  const b = buildReadingBrief(W, [fy("FY26", "2026-03-31", notes({ contingent: 8 }, [...many, { note: "ratios", id: "r", severity: "info", title: "Current ratio moved", page: 5 }]))])!;
  assert.equal(b.items.length, BRIEF_LIMIT);
  assert.equal(b.more, 3);
  assert.ok(b.items.every((i) => !/Current ratio moved/.test(i.title)));
});

test("what was not read is listed: unrecognised notes, untestable indicators, and no prior year", () => {
  const b = buildReadingBrief(W, [fy("FY26", "2026-03-31", notes({ ageing: 1 }, []))])!;
  const text = b.not_read.join(" | ");
  assert.match(text, /Auditor's CARO answers: not recognised in the FY26 report/);
  assert.match(text, /Related-party transactions: not recognised/);
  assert.ok(!/Receivables ageing: not recognised/.test(text));
  assert.match(text, /early-warning indicators? could not be tested/);
  assert.match(text, /No previous year to compare with/);
  assert.match(b.headline, /^Nothing at medium or high in what was read of FY26, and \d+ things were not read\.$/);
});

test("a breached covenant is on the list with no page, and the headline counts pages honestly", () => {
  const stmt = fy("FY26", "2026-03-31", notes({ ageing: 1 }, []), { current_assets: 100, current_liabilities: 200 });
  const b = buildReadingBrief(W, [stmt], [{ workspace_id: "a", name: "Working capital line", metric: "current_ratio", comparator: "min", limit_value: 1 }], "2026-10-30")!;
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].source, "covenant");
  assert.equal(b.items[0].page, null);
  assert.match(b.headline, /^One finding to read first; /);
});
