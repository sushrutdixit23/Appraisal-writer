// The ratio-disclosure reader, against the real FY26 reports of TCS, Infosys, Tech Mahindra, Wipro and HCLTech (the pages are fixtures; the expected figures
// were checked by hand against them), and synthetic rows for what a real report does not show. The test that matters most is the one for a row that cannot be
// verified: it is dropped, not guessed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crossCheck, ratioFindings, readReportedRatios, type ReportedRatio } from "../../app/sentinel/lib/autofill/notes/ratios";
import { near } from "./helpers";

const load = (co: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `ratios-${co}.json`), "utf-8")) as { num: number; text: string }[];
const row = (co: string, id: string, page?: number): ReportedRatio => readReportedRatios(load(co)).find((r) => r.id === id && (page == null || r.page === page))!;

test("TCS (numerators wrapped over several lines, no variance column): ten ratios, standalone, current ratio 2.0 against 2.1, ROE 61.3% against 65.1%", () => {
  const rows = readReportedRatios(load("tcs"));
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.basis === "standalone"));
  assert.deepEqual([row("tcs", "current_ratio").current, row("tcs", "current_ratio").previous], [2, 2.1]);
  assert.deepEqual([row("tcs", "roe").current, row("tcs", "roe").previous], [61.3, 65.1]);
  assert.deepEqual([row("tcs", "dscr").current, row("tcs", "dscr").previous], [19.8, 23.5]); // the figures sit under a five-line definition
  assert.equal(row("tcs", "current_ratio").printed_variance, null);
});

test("Infosys (consolidated, a variance column): current ratio 2.0 against 2.4 with the printed (16.5) following from them; a four-column table is not guessed at", () => {
  const r = row("infosys", "current_ratio");
  assert.deepEqual([r.current, r.previous, r.printed_variance, r.variance_kind], [2, 2.4, -16.5, "relative"]);
  assert.equal(r.basis, "consolidated");
  assert.equal(row("infosys", "net_margin").variance_kind, "points"); // 19.6% against 18.7% prints 0.9, the difference in points
  // the Management Discussion table on page 81 has two bases side by side (four figure columns): not read
  assert.equal(readReportedRatios(load("infosys")).filter((x) => x.page !== 274).length, 0);
});

test("Tech Mahindra (a name and definition wrapped over four lines, figures on the last): debt service coverage 11.52 against 9.99, +15.38% printed", () => {
  const r = row("tml", "dscr");
  assert.deepEqual([r.current, r.previous, r.printed_variance], [11.52, 9.99, 15.38]);
  assert.equal(readReportedRatios(load("tml")).length, 10); // all ten, including ROCE 23.36 vs 20.24 and ROI 5.84 vs 8.27 on the next page
});

test("Wipro: a figure stuck to the label is recovered (2.42 in 'Current assets Current liabilities 2.42'), and a points variance is recognised", () => {
  const c = row("wipro", "current_ratio", 270);
  assert.deepEqual([c.current, c.previous, c.printed_variance, c.variance_kind], [2.42, 2.72, -11.03, "relative"]);
  const roe = row("wipro", "roe", 270);
  assert.deepEqual([roe.current, roe.previous, roe.printed_variance, roe.variance_kind], [19.08, 17.93, 1.15, "points"]);
  // the three-year Key Ratios table (current, last year, year before, change) is read when the change follows from the first two
  const k = row("wipro", "current_ratio", 45);
  assert.deepEqual([k.current, k.previous, k.printed_variance], [2.05, 2.72, -24.6]);
});

test("HCLTech: the same table in the directors' report (basis unknown) and the standalone notes; current ratio 1.5 against 2.1, (28.6)% printed", () => {
  const r = row("hcl", "current_ratio", 128);
  assert.deepEqual([r.current, r.previous, r.printed_variance], [1.5, 2.1, -28.6]);
  assert.equal(r.basis, "standalone");
});

test("a row is dropped, not guessed, when its printed variance does not follow from its own figures", () => {
  const page = { num: 1, text: [
    "Ratio \tNumerator \tDenominator \tCurrent year \tPrevious year \tVariance",
    "Current ratio (in times) \tCurrent assets \tCurrent liabilities \t2.0 \t2.1 \t40.0%",
    "Debt-equity ratio (in times) \tTotal debt \tTotal equity \t0.5 \t0.4 \t25.0%",
    "Return on equity (in %) \tProfit \tEquity \t15.0% \t12.0% \t25.0%",
  ].join("\n") };
  const got = readReportedRatios([page]);
  assert.deepEqual(got.map((r) => r.id), ["debt_equity", "roe"]); // the current ratio's 40% cannot come from 2.0 and 2.1
});

test("a page with fewer than three ratio rows is not a ratio table", () => {
  const page = { num: 1, text: "Current ratio \t2.0 \t2.1\nDebt-equity ratio \t0.5 \t0.4" };
  assert.deepEqual(readReportedRatios([page]), []);
});

test("self-flags: a move of 25% or more is reported once even when printed twice; a points-variance ratio and a tiny base are not", () => {
  const f = ratioFindings(readReportedRatios(load("hcl")));
  const titles = f.map((x) => x.title);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(titles.includes("Current ratio moved down 29% (2.1 to 1.5)"));
  assert.ok(f.every((x) => x.severity === "info"));
  assert.equal(ratioFindings(readReportedRatios(load("infosys"))).length, 0);
});

test("cross-check: the company's current ratio and net margin against what Sentinel computes from the statements it read", () => {
  const rows = readReportedRatios(load("infosys")); // consolidated
  const stmt = { basis: "consolidated" as const, current_assets: 200, current_liabilities: 100, profit_after_tax: 196, revenue_from_operations: 1000 };
  const checks = crossCheck(rows, stmt);
  const cr = checks.find((c) => c.id === "current_ratio")!;
  assert.equal(cr.agrees, true); // 200 / 100 = 2.0, as reported
  const nm = checks.find((c) => c.id === "net_margin")!;
  assert.equal(nm.agrees, true); // 19.6%
  near(nm.computed, 19.6);
  const wrong = crossCheck(rows, { ...stmt, current_liabilities: 140 }).find((c) => c.id === "current_ratio")!;
  assert.equal(wrong.agrees, false);
  assert.match(wrong.detail, /reports a current ratio of 2; Sentinel computes 1\.43/);
  // a table on the other basis is not compared
  assert.deepEqual(crossCheck(rows, { ...stmt, basis: "standalone" }), []);
});
