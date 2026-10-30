// The scorecard's own arithmetic: tie-outs, figure comparison and the sheet an outside checker marks.

import test from "node:test";
import assert from "node:assert/strict";
import { compareFields, precisionFromSheet, summariseBacktest, summariseComparison, tieOutAgeing, toCsv } from "../../app/sentinel/lib/evaluation/notesScorecard";
import type { AgeingTable } from "../../app/sentinel/lib/autofill/notes/ageing";

const table = (over: Partial<AgeingTable> = {}): AgeingTable => ({ page: 5, unit: "crore", year_hint: 2026, buckets: [], rows: [], total: [0, 0, 0, 0, 0, 0, 1000], total_prior: null, allowance: 40, rows_checked: 3, rows_rejected: 0, total_agrees: true, excerpt: "", ...over });

test("tie-out: gross 1,000 less allowance 40 is 960, and 960 printed on the page ties the table to the filing", () => {
  const page = { num: 5, text: "Trade receivables \t1,000\nLess: allowance \t(40)\nNet trade receivables \t960" };
  assert.equal(tieOutAgeing(table(), page).status, "tied");
  assert.equal(tieOutAgeing(table(), { num: 5, text: "Net trade receivables \t975" }).status, "no_match");
  assert.equal(tieOutAgeing(table({ allowance: null }), page).status, "not_testable");
});

test("comparison with typed figures: a match within rounding, a wrong figure, and a missing one are counted apart", () => {
  const rows = compareFields({ revenue: 220938, pat: 49096, equity: 110270, capex: 8259 }, { revenue: 220938.2, pat: 12, equity: null });
  assert.deepEqual(rows.map((r) => r.status), ["match", "wrong", "missing", "missing"]);
  const s = summariseComparison(rows);
  assert.deepEqual([s.n, s.match, s.wrong, s.missing], [4, 1, 1, 2]);
  assert.ok(s.interval && s.interval[0] < 0.25 && s.interval[1] > 0.25);
});

test("the checker's sheet: every extracted item with its page and source and an empty verdict column; marked, it gives precision per reader with an interval", () => {
  const rows = [
    { file: "a.pdf", reader: "caro", page: 437, what: "Fraud", values: "adverse", source: 'a report under sub-section (12) "has been filed"' },
    { file: "a.pdf", reader: "caro", page: 435, what: "Title deeds", values: "adverse", source: "except for properties" },
    { file: "a.pdf", reader: "ageing", page: 184, what: "gross", values: "58,267", source: "Undisputed ... 57,823" },
  ];
  const blank = toCsv(rows);
  assert.match(blank.split("\n")[0], /verdict \(right \/ wrong \/ partly\)/);
  assert.equal(blank.split("\n").length, 4);
  assert.equal(precisionFromSheet(blank).caro.unmarked, 2); // nothing is claimed until someone has looked
  assert.equal(precisionFromSheet(blank).caro.precision, null);
  const marked = precisionFromSheet(toCsv([{ ...rows[0], verdict: "right" }, { ...rows[1], verdict: "wrong", notes: "the page says held in the Company's name" }, { ...rows[2], verdict: "right" }]));
  assert.deepEqual([marked.caro.right, marked.caro.wrong, marked.caro.precision], [1, 1, 0.5]);
  assert.equal(marked.ageing.precision, 1);
  assert.ok(marked.caro.interval && marked.caro.interval[0] < 0.5 && marked.caro.interval[1] > 0.5);
});

test("backtest summary: catch rate over cases, false-alarm rate over controls, hard controls apart, each with an interval", () => {
  const r = (file: string, label: "case" | "control", flagged: boolean, hard = false) => ({ file, label, hard, high: flagged ? 1 : 0, medium: 0, flagged, top: null, not_read: [] });
  const s = summariseBacktest([r("a", "case", true), r("b", "case", true), r("c", "case", false), r("d", "case", true), r("e", "case", true), ...Array.from({ length: 13 }, (_, i) => r(`c${i}`, "control", i === 0)), r("h1", "control", true, true), r("h2", "control", false, true)]);
  assert.deepEqual([s.catch.flagged, s.catch.n, s.catch.rate], [4, 5, 0.8]);
  assert.deepEqual([s.false_alarm.flagged, s.false_alarm.n], [2, 15]);
  assert.deepEqual([s.hard_controls.flagged, s.hard_controls.n], [1, 2]);
  assert.ok(s.catch.interval && s.catch.interval[0] > 0.37 && s.catch.interval[0] < 0.39 && s.catch.interval[1] > 0.96 && s.catch.interval[1] < 0.99, JSON.stringify(s.catch.interval)); // 4 of 5: about 38% to 96%
  assert.equal(summariseBacktest([]).catch.rate, null);
});
