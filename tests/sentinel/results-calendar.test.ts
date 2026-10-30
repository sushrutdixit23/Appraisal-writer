// The results calendar: statutory deadlines (45 days after a quarter, 60 after the year) worked out from the fiscal year, and what
// the digest says about them. Expected dates are counted on a calendar, not copied from the code under test.

import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../app/sentinel/lib/digest";
import { buildResultsCalendar, describeRow, resultsWindow } from "../../app/sentinel/lib/resultsCalendar";
import { st, ws } from "./helpers";

const ME = "me";
const listed = (id: string, over = {}) => ws(id, { sector: "technology", owner_id: ME, is_public_reference: false, ticker: id.toUpperCase(), fiscal_year_start_month: 4, ...over });

test("April-March company on 29 Oct 2026: Q2 FY27 (ended 30 Sep) is due 14 Nov, 45 days on; Q3 follows on 14 Feb 2027", () => {
  const { latest, next } = resultsWindow("2026-10-29", 4);
  assert.deepEqual([latest.period_label, latest.period_end_date, latest.due_date, latest.year_end], ["Q2 FY27", "2026-09-30", "2026-11-14", false]);
  assert.deepEqual([next.period_label, next.period_end_date, next.due_date], ["Q3 FY27", "2026-12-31", "2027-02-14"]);
});

test("the last quarter of the year is reported with the audited year, on the 60-day window: 31 Mar 2026 + 60 days = 30 May", () => {
  const { latest } = resultsWindow("2026-04-10", 4);
  assert.deepEqual([latest.period_label, latest.due_date, latest.year_end], ["Q4 FY26", "2026-05-30", true]);
});

test("a calendar-year company: Q4 ends 31 Dec and is due 1 Mar (31 Dec + 60 days in a non-leap year)", () => {
  const { latest, next } = resultsWindow("2026-02-10", 1);
  assert.deepEqual([latest.period_label, latest.period_end_date, latest.due_date, latest.year_end], ["Q4 FY25", "2025-12-31", "2026-03-01", true]);
  assert.deepEqual([next.period_label, next.period_end_date, next.due_date], ["Q1 FY26", "2026-03-31", "2026-05-15"]);
});

test("on the day a quarter ends, that quarter is the one being waited for, with the full 45 days left", () => {
  const rows = buildResultsCalendar([listed("a")], [], "2026-09-30", ME);
  assert.deepEqual([rows[0].period_label, rows[0].days_left, rows[0].status], ["Q2 FY27", 45, "open"]);
});

test("status: filed when the period is on file, due this week within 7 days, past the deadline after it", () => {
  const w = [listed("a"), listed("b"), listed("c"), listed("d")];
  const statements = [st("a", { period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30" })];
  const at = (today: string) => Object.fromEntries(buildResultsCalendar(w, statements, today, ME).map((r) => [r.workspace_id, r.status]));
  assert.deepEqual(at("2026-10-29"), { a: "filed", b: "open", c: "open", d: "open" });
  assert.deepEqual(at("2026-11-08"), { a: "filed", b: "due_soon", c: "due_soon", d: "due_soon" }); // 6 days left
  assert.deepEqual(at("2026-11-07"), { a: "filed", b: "due_soon", c: "due_soon", d: "due_soon" }); // exactly 7 days left
  assert.deepEqual(at("2026-11-06"), { a: "filed", b: "open", c: "open", d: "open" }); // 8 days left
  assert.deepEqual(at("2026-11-15"), { a: "filed", b: "overdue", c: "overdue", d: "overdue" });
});

test("a year-end quarter is on file if the annual statement ends that day, whichever type it was entered as", () => {
  const rows = buildResultsCalendar([listed("a")], [st("a", { period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31" })], "2026-04-20", ME);
  assert.equal(rows[0].status, "filed");
});

test("only your own listed companies appear: reference companies, other people's, and ones with no symbol or code are left out", () => {
  const w = [listed("mine"), listed("ref", { is_public_reference: true, owner_id: null }), listed("theirs", { owner_id: "other" }), ws("private", { sector: "technology", owner_id: ME, is_public_reference: false }), listed("bseonly", { ticker: null, bse_code: "532540" })];
  assert.deepEqual(buildResultsCalendar(w, [], "2026-10-29", ME).map((r) => r.workspace_id).sort(), ["bseonly", "mine"]);
});

test("rows are ordered overdue, due this week, not due yet, then filed; ties by deadline then name", () => {
  const w = [listed("filed"), listed("open"), listed("late"), listed("alpha"), listed("beta")];
  const statements = [st("filed", { period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30" })];
  const rows = buildResultsCalendar(w, statements, "2026-11-20", ME);
  assert.deepEqual(rows.map((r) => r.status), ["overdue", "overdue", "overdue", "overdue", "filed"]);
  assert.deepEqual(rows.map((r) => r.company_name).slice(0, 4), ["ALPHA", "BETA", "LATE", "OPEN"]);
});

test("the wording says what is not known: not imported is not the same as not filed", () => {
  const [late] = buildResultsCalendar([listed("a")], [], "2026-11-20", ME);
  assert.match(describeRow(late), /not in Sentinel and the statutory deadline \(2026-11-14\) passed 6 days ago\. Import the filing, or check whether the company filed late/);
  const [soon] = buildResultsCalendar([listed("a")], [], "2026-11-14", ME);
  assert.match(describeRow(soon), /due by 2026-11-14, today\. Nothing is imported yet/);
});

test("the digest lists results due this week and past the deadline, not ones that are far off or already imported", () => {
  const base = { userId: ME, statements: [st("filed", { period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30" })], recommendations: [], investigations: [] };
  const w = [listed("filed"), listed("soon")];
  const d = buildDigest({ ...base, workspaces: w, today: "2026-11-10" });
  const items = d.sections.find((s) => s.id === "results")!.items;
  assert.deepEqual(items.map((i) => i.title), ["SOON - Q2 FY27 results due this week"]);
  const far = buildDigest({ ...base, workspaces: w, today: "2026-10-20" });
  assert.equal(far.sections.find((s) => s.id === "results")!.items.length, 0);
  const late = buildDigest({ ...base, workspaces: w, today: "2026-11-20" });
  assert.deepEqual(late.sections.find((s) => s.id === "results")!.items.map((i) => i.title), ["SOON - Q2 FY27 results past the deadline"]);
});
