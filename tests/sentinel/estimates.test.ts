// Estimates and variance, against hand-worked figures. Acme's Q2 FY27 actuals (crore): revenue 1,100, EBITDA 220, PBT 200, PAT 150.

import test from "node:test";
import assert from "node:assert/strict";
import { buildResultsBrief } from "../../app/sentinel/lib/quarterly";
import { buildVariance, callFor, parseEstimatesCsv, variance, waitingForResults, type EstimateRow } from "../../app/sentinel/lib/estimates";
import { near, st, ws } from "./helpers";

const brief = () => buildResultsBrief(
  [ws("acme", { sector: "technology" })],
  [st("acme", { period_type: "Q2", period_label: "Q2 FY27", period_end_date: "2026-09-30", revenue_from_operations: 1100, ebitda: 220, profit_before_tax: 200, profit_after_tax: 150, tax_expense: 50 })],
  "acme"
)!;
const est = (metric: EstimateRow["metric"], value_cr: number, source: EstimateRow["source"] = "consensus", end = "2026-09-30", label: string | null = null): EstimateRow => ({ period_end_date: end, metric, value_cr, source, source_label: label });

test("variance is measured against the size of the estimate: 1,100 against 1,080 is +1.85%", () => {
  assert.ok(near(variance(1100, 1080), 20 / 1080, 1e-12));
  assert.equal(variance(10, 0), null);
  assert.ok(near(variance(-5, -10), 0.5, 1e-12)); // a loss that narrowed is an upside surprise, sign included
});

test("beat, miss and in line use each line's own tolerance: 1% on revenue, 2% on EBITDA, 3% on profit", () => {
  assert.equal(callFor("revenue", 0.0101), "beat");
  assert.equal(callFor("revenue", 0.01), "in line");
  assert.equal(callFor("revenue", -0.0101), "miss");
  assert.equal(callFor("ebitda", -0.0179), "in line");
  assert.equal(callFor("ebitda", -0.0201), "miss");
  assert.equal(callFor("pat", 0.03), "in line");
  assert.equal(callFor("pat", null), null);
});

test("the brief against estimates: revenue beats consensus, EBITDA is in line, PAT misses - each with its own number", () => {
  const rows = buildVariance(brief(), [est("revenue", 1080, "consensus", "2026-09-30", "Bloomberg"), est("ebitda", 224), est("pat", 160), est("pat", 148, "own")]);
  const by = Object.fromEntries(rows.map((r) => [r.metric, r]));
  assert.deepEqual(Object.keys(by), ["revenue", "ebitda", "pat"]); // PBT has no estimate: no row
  assert.equal(by.revenue.actual, 1100);
  assert.equal(by.revenue.estimates[0].call, "beat");
  assert.equal(by.revenue.estimates[0].source_label, "Bloomberg");
  assert.equal(by.ebitda.estimates[0].call, "in line");
  assert.deepEqual(by.pat.estimates.map((e) => [e.source, e.call]), [["consensus", "miss"], ["own", "in line"]]); // 150 vs 160 is -6.25%; vs 148 is +1.35%
  assert.ok(near(by.pat.estimates[0].variance, -10 / 160, 1e-12));
});

test("only estimates for this quarter's end date count; estimates for other quarters wait", () => {
  const all = [est("revenue", 1080), est("revenue", 9999, "consensus", "2026-12-31"), est("pat", 1, "own", "2027-03-31"), est("ebitda", 1, "own", "2026-12-31")];
  assert.equal(buildVariance(brief(), all).length, 1);
  assert.deepEqual(waitingForResults(all, new Set(["2026-09-30"])), [{ period_end_date: "2026-12-31", count: 2 }, { period_end_date: "2027-03-31", count: 1 }]);
});

test("CSV: one row per period, a column per line in crore, optional source and label; periods as labels, month-years or dates", () => {
  const csv = "period,revenue,EBITDA,PBT,PAT,source,source label\nQ2 FY27,\"1,080\",224,196,160,consensus,Bloomberg\nSep-26,1085,,,150,own,\n2026-12-31,1120,230,,,,Visible Alpha\n";
  const r = parseEstimatesCsv(csv, 4);
  assert.deepEqual(r.errors, []);
  const get = (end: string, metric: string, source: string) => r.rows.find((x) => x.period_end_date === end && x.metric === metric && x.source === source);
  assert.equal(get("2026-09-30", "revenue", "consensus")?.value_cr, 1080);
  assert.equal(get("2026-09-30", "revenue", "consensus")?.source_label, "Bloomberg");
  assert.equal(get("2026-09-30", "pat", "own")?.value_cr, 150);
  assert.equal(get("2026-12-31", "ebitda", "consensus")?.value_cr, 230); // an empty source column falls back to the default
  assert.equal(r.rows.length, 4 + 2 + 2);
});

test("CSV: headings in other words are understood; a bad number, an unreadable period and an unknown source are reported by row, and the good rows still load", () => {
  const csv = "Quarter,Net Sales (Rs cr),Net Profit,Source\nQ2 FY27,1080,160,Street\nsometime,1,2,\nQ3 FY27,abc,150,whoever\n";
  const r = parseEstimatesCsv(csv, 4);
  assert.equal(r.rows.filter((x) => x.period_end_date === "2026-09-30").length, 2);
  assert.match(r.errors.join(" | "), /Row 3: "sometime" is not a period/);
  assert.match(r.errors.join(" | "), /Row 4: "abc" under net sales is not a number/);
  assert.match(r.errors.join(" | "), /Row 4: source "whoever" is not "consensus" or "own"/);
  assert.equal(r.rows.find((x) => x.period_end_date === "2026-12-31" && x.metric === "pat")?.value_cr, 150);
});

test("CSV: no period column, no estimate columns, or an empty file each say what is wrong", () => {
  assert.match(parseEstimatesCsv("revenue,ebitda\n1,2", 4).errors[0], /"period" column/);
  assert.match(parseEstimatesCsv("period,colour\nQ2 FY27,red", 4).errors[0], /No estimate columns found/);
  assert.match(parseEstimatesCsv("period", 4).errors[0], /header row and at least one row/);
});
