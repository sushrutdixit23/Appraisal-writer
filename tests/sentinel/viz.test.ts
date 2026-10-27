// The pure part of the charts and tables: scales, number formats, what a change means, the profit bridge, peer
// bands and heat colours, sorting and CSV. The components are drawn from these, so the numbers on screen are
// checked here by hand-worked cases rather than by looking at pixels.

import test from "node:test";
import assert from "node:assert/strict";
import { labelStep, lineDomain, linearScale, nearestIndex, niceNumber, niceTicks } from "../../app/sentinel/lib/viz/scale";
import {
  formatAccounting, formatAmount, formatPoints, formatSignedAmount, formatSignedPercent, formatTick, formatValue, labelFits,
} from "../../app/sentinel/lib/viz/format";
import { arrowFor, cagr, deltaTone, pctChange, pointChange, toneWords, yearsBetween } from "../../app/sentinel/lib/viz/semantics";
import { bridgeBars, buildProfitBridge } from "../../app/sentinel/lib/viz/bridge";
import { columnScores, contrastRatio, heatColor, luminance, median, peerBand, readableText } from "../../app/sentinel/lib/viz/peers";
import { compareCells, nextSort, sortRows, toCsv } from "../../app/sentinel/lib/viz/table";
import { VIZ } from "../../app/sentinel/lib/viz/tokens";

// ---- scales ---------------------------------------------------------------------------------------------------
test("niceNumber: 1, 2, 5 or 10 times a power of ten", () => {
  assert.equal(niceNumber(1300, false), 2000);
  assert.equal(niceNumber(500, true), 500);
  assert.equal(niceNumber(0.07, true), 0.1); // 7 is nearer to 10 than to 5
  assert.equal(niceNumber(0.04, true), 0.05);
  assert.equal(niceNumber(0, true), 1);
  assert.equal(niceNumber(NaN, true), 1);
});

test("niceTicks: round ticks that cover the data, evenly spaced", () => {
  const t = niceTicks(0, 1300, 5);
  assert.ok(t.min <= 0 && t.max >= 1300);
  assert.deepEqual(t.ticks, [0, 500, 1000, 1500]);
  for (let i = 1; i < t.ticks.length; i++) assert.ok(Math.abs(t.ticks[i] - t.ticks[i - 1] - t.step) < 1e-9);
});

test("niceTicks: negatives, zero inclusion, and a flat series still get a readable axis", () => {
  const neg = niceTicks(-40, 120, 5);
  assert.ok(neg.min <= -40 && neg.max >= 120 && neg.ticks.includes(0));
  const z = niceTicks(1000, 1300, 5, true);
  assert.equal(z.min, 0);
  const flat = niceTicks(5, 5, 5);
  assert.ok(flat.min < 5 && flat.max > 5 && flat.ticks.length >= 2);
});

test("niceTicks: small steps carry enough decimals that ticks never repeat", () => {
  const t = niceTicks(0.07, 0.083, 5);
  assert.ok(t.decimals >= 3);
  const labels = t.ticks.map((v) => formatTick("percent", v, t.decimals));
  assert.equal(new Set(labels).size, labels.length, labels.join(" "));
});

test("linearScale, nearestIndex and labelStep", () => {
  const s = linearScale(0, 100, 0, 200);
  assert.equal(s(50), 100);
  assert.equal(linearScale(5, 5, 0, 10)(5), 5); // a degenerate domain does not divide by zero
  assert.equal(nearestIndex([10, 50, 90], 61), 1);
  assert.equal(nearestIndex([10, 50, 90], 80), 2);
  assert.equal(labelStep(12, 600, 60), 2); // 12 labels over 600px = 54px apart: show every second
  assert.equal(labelStep(4, 600, 60), 1);
  assert.equal(labelStep(1, 600, 60), 1);
});

test("lineDomain: follows the data, but reads against zero when the data touches or crosses it", () => {
  const far = lineDomain([1000, 1300]);
  assert.ok(far.min > 0, "a revenue line 1,000 to 1,300 should not be squashed against a zero baseline");
  const cross = lineDomain([-20, 90]);
  assert.ok(cross.min <= -20 && cross.ticks.includes(0));
  const near = lineDomain([5, 100]);
  assert.equal(near.min, 0);
});

// ---- formats --------------------------------------------------------------------------------------------------
test("amounts use Indian grouping, never print -0, and accounting negatives go in brackets", () => {
  assert.equal(formatAmount(130000), "1,30,000");
  assert.equal(formatAmount(1234567.5, 1), "12,34,567.5");
  assert.equal(formatAmount(-0.0001, 0), "0");
  assert.equal(formatAccounting(-1200.04), "(1,200.0)");
  assert.equal(formatAccounting(0.04), "0.0");
  assert.equal(formatSignedAmount(100), "+100");
  assert.equal(formatSignedAmount(-100), "-100");
  assert.equal(formatSignedAmount(0.2), "0");
});

test("changes always show their sign; ratios and points format as people write them", () => {
  assert.equal(formatSignedPercent(0.3), "+30.0%");
  assert.equal(formatSignedPercent(-0.042), "-4.2%");
  assert.equal(formatSignedPercent(0.00001), "0.0%");
  assert.equal(formatPoints(0.003), "+0.3pp");
  assert.equal(formatPoints(-0.012), "-1.2pp");
  assert.equal(formatValue("percent", 0.123), "12.3%");
  assert.equal(formatValue("multiple", 1.25), "1.25x");
  assert.equal(formatValue("days", 31.7), "32d");
});

test("labelFits: a label goes inside a bar only when it fits with padding on both sides", () => {
  assert.equal(labelFits(5, 11, 80), true);
  assert.equal(labelFits(9, 11, 60), false);
});

// ---- what a change means --------------------------------------------------------------------------------------
test("pctChange measures against the size of the prior figure, so a narrowing loss is growth", () => {
  assert.equal(pctChange(1300, 1000), 0.3);
  assert.equal(pctChange(-50, -100), 0.5);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(null, 100), null);
  assert.equal(pointChange(0.077, 0.08)?.toFixed(3), "-0.003");
});

test("cagr: defined only for positive ends and elapsed time", () => {
  assert.ok(Math.abs((cagr(1000, 1331, 3) ?? 0) - 0.1) < 1e-9);
  assert.equal(cagr(0, 100, 3), null);
  assert.equal(cagr(100, -5, 3), null);
  assert.equal(cagr(100, 200, 0), null);
  assert.equal(yearsBetween("2023-03-31", "2026-03-31"), 3);
  assert.equal(yearsBetween("2024-03-31", "2025-03-31"), 1); // leap year: 365 days, still one year
});

test("deltaTone: direction x desirability. Revenue up is good, days up is not, costs rising are neither", () => {
  assert.equal(deltaTone(0.3, "higher"), "favorable");
  assert.equal(deltaTone(-0.1, "higher"), "unfavorable");
  assert.equal(deltaTone(0.2, "lower"), "unfavorable");
  assert.equal(deltaTone(-0.2, "lower"), "favorable");
  assert.equal(deltaTone(0.2, "neutral"), "neutral");
  assert.equal(deltaTone(0.0001, "higher"), "flat");
  assert.equal(deltaTone(null, "higher"), null);
  assert.equal(arrowFor(0.2), "▲");
  assert.equal(arrowFor(-0.2), "▼");
  assert.equal(arrowFor(0), "▬");
  assert.equal(toneWords("favorable"), "favourable");
});

// ---- the profit bridge ----------------------------------------------------------------------------------------
const full = { revenue_from_operations: 1000, other_income: 50, total_income: 1050, total_expenses: 900, depreciation_amortisation: 60, finance_costs: 20, exceptional_items: 30, profit_before_tax: 120, tax_expense: 30, profit_after_tax: 90 };

test("bridge: revenue to PAT, each step worked by hand, ending exactly on the reported profits", () => {
  const b = buildProfitBridge(full)!;
  assert.equal(b.reconciled, true);
  assert.deepEqual(b.steps.map((s) => [s.id, s.value]), [
    ["revenue", 1000], ["other_income", 50], ["operating_costs", -820], ["depreciation", -60], ["finance_costs", -20],
    ["exceptional", -30], ["pbt", 120], ["tax", -30], ["pat", 90],
  ]);
  const bars = bridgeBars(b.steps);
  assert.equal(bars.find((x) => x.id === "other_income")!.to, 1050);
  assert.equal(bars.find((x) => x.id === "operating_costs")!.to, 230);
  assert.equal(bars.find((x) => x.id === "exceptional")!.to, 120); // 1000 + 50 - 820 - 60 - 20 - 30
  assert.equal(bars.find((x) => x.id === "pbt")!.to, 120);
  assert.equal(bars.find((x) => x.id === "tax")!.to, 90);
});

test("bridge: a missing cost line is worked out from the reported profit and marked implied", () => {
  const b = buildProfitBridge({ ...full, total_expenses: null, depreciation_amortisation: null, finance_costs: null })!;
  const costs = b.steps.find((s) => s.id === "costs")!;
  assert.equal(costs.value, -900); // 1000 + 50 - 30 - 120
  assert.equal(costs.implied, true);
  assert.equal(b.reconciled, true);
  assert.match(b.notes.join(" "), /worked out/);
});

test("bridge: when reported lines do not add up, the gap is its own step and the ends still match the filing", () => {
  const b = buildProfitBridge({ ...full, profit_before_tax: 130, profit_after_tax: 95 })!;
  assert.equal(b.reconciled, false);
  assert.equal(b.steps.find((s) => s.id === "unreconciled_pbt")!.value, 10);
  assert.equal(b.steps.find((s) => s.id === "unreconciled_pat")!.value, -5); // 130 - 30 = 100, but 95 is reported
  // Whatever the gaps, the bridge starts at revenue and ends at the reported PAT.
  assert.equal(b.steps[0].value, 1000);
  assert.equal(b.steps.at(-1)!.value, 95);
});

test("bridge: rounding noise of under a unit is not shown as a gap, but a real mismatch is", () => {
  assert.equal(buildProfitBridge({ ...full, profit_before_tax: 120.8, profit_after_tax: 90.8 })!.reconciled, true);
  assert.equal(buildProfitBridge({ ...full, profit_before_tax: 126, profit_after_tax: 96 })!.reconciled, false);
});

test("bridge: a loss, no tax line, and nothing to build from", () => {
  const loss = buildProfitBridge({ revenue_from_operations: 100, other_income: null, total_income: null, total_expenses: 120, depreciation_amortisation: null, finance_costs: null, exceptional_items: null, profit_before_tax: -20, tax_expense: null, profit_after_tax: -20 })!;
  assert.equal(loss.steps.at(-1)!.value, -20);
  assert.ok(!loss.steps.some((s) => s.id === "tax")); // pbt - pat = 0: no tax step
  assert.equal(buildProfitBridge({ ...full, revenue_from_operations: null as unknown as number }), null);
});

// ---- peers and heat -------------------------------------------------------------------------------------------
test("median and the peer band: peers only, and a band needs at least two peers at that point", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  const band = peerBand(
    [
      { id: "me", values: [100, 200, 300] },
      { id: "a", values: [10, 20, null] },
      { id: "b", values: [30, null, null] },
      { id: "c", values: [20, 40, 50] },
    ],
    "me",
    3
  );
  assert.deepEqual(band.min, [10, 20, null]); // the subject is never in its own peer band
  assert.deepEqual(band.max, [30, 40, null]);
  assert.deepEqual(band.median, [20, 30, null]);
  assert.deepEqual(band.n, [3, 2, 1]);
});

test("columnScores: 1 is best in the column, whichever way is better; missing stays missing", () => {
  assert.deepEqual(columnScores([10, 20, 30], "higher"), [0, 0.5, 1]);
  assert.deepEqual(columnScores([10, 20, 30], "lower"), [1, 0.5, 0]);
  assert.deepEqual(columnScores([10, null, 30], "higher"), [0, null, 1]);
  assert.deepEqual(columnScores([5, 5], "higher"), [0.5, 0.5]);
  assert.deepEqual(columnScores([7], "higher"), [0.5]);
});

test("heat colours get darker as the score rises, and the text on them is always readable", () => {
  const ts = [0, 0.25, 0.5, 0.75, 1];
  const lum = ts.map((t) => luminance(heatColor(t)));
  for (let i = 1; i < lum.length; i++) assert.ok(lum[i] < lum[i - 1], "heat ramp must be monotone");
  for (const t of ts) {
    const bg = heatColor(t);
    assert.ok(contrastRatio(bg, readableText(bg)) >= 4.5, `text on ${bg}`);
  }
  assert.equal(readableText("#161616"), "#FFFFFF");
});

test("colour tokens clear the contrast the method asks for on the white card", () => {
  for (const mark of [VIZ.subject, VIZ.secondary, VIZ.unfavorable, VIZ.contextLine]) assert.ok(contrastRatio(mark, VIZ.surface) >= 3, mark);
  for (const text of [VIZ.favorableText, VIZ.unfavorableText, VIZ.textSoft]) assert.ok(contrastRatio(text, VIZ.surface) >= 4.5, text);
});

// ---- tables ---------------------------------------------------------------------------------------------------
test("sorting: numbers by value, text naturally, and a missing value is last whichever way you sort", () => {
  assert.ok(compareCells(1, 2, "asc") < 0);
  assert.ok(compareCells(1, 2, "desc") > 0);
  assert.ok(compareCells(null, 5, "asc") > 0);
  assert.ok(compareCells(null, 5, "desc") > 0);
  assert.ok(compareCells("FY9", "FY10", "asc") < 0); // natural order, not alphabetical
  const rows = [{ n: "a", v: 2 }, { n: "b", v: null }, { n: "c", v: 2 }, { n: "d", v: 9 }];
  assert.deepEqual(sortRows(rows, (r) => r.v, "desc").map((r) => r.n), ["d", "a", "c", "b"]); // a before c: stable
  assert.deepEqual(sortRows(rows, (r) => r.v, "asc").map((r) => r.n), ["a", "c", "d", "b"]);
});

test("nextSort: a new column starts in its natural direction, the same column flips", () => {
  assert.deepEqual(nextSort(null, "rev"), { key: "rev", dir: "desc" });
  assert.deepEqual(nextSort({ key: "rev", dir: "desc" }, "rev"), { key: "rev", dir: "asc" });
  assert.deepEqual(nextSort({ key: "rev", dir: "asc" }, "pat"), { key: "pat", dir: "desc" });
  assert.deepEqual(nextSort(null, "name", "asc"), { key: "name", dir: "asc" });
});

test("CSV: quoting, doubled quotes, and a text cell cannot be read as a spreadsheet formula", () => {
  const csv = toCsv(["Company", "Revenue"], [["Acme, Inc", 1000], ['He said "hi"', null], ["=HYPERLINK(1)", -5.5], ["-bad", 2]]);
  assert.equal(csv, ['Company,Revenue', '"Acme, Inc",1000', '"He said ""hi""",', "'=HYPERLINK(1),-5.5", "'-bad,2"].join("\r\n"));
});

// ---- geometry, wrapping, ranking, tile deltas -----------------------------------------------------------------
import { wrapWords } from "../../app/sentinel/lib/viz/format";
import { columnPath } from "../../app/sentinel/lib/viz/geometry";
import { ordinalRank } from "../../app/sentinel/lib/viz/rank";
import { makeDelta } from "../../app/sentinel/lib/viz/delta";

test("wrapWords: wraps on word boundaries, keeps a long word whole, and never exceeds the line limit", () => {
  assert.deepEqual(wrapWords("Profit before tax", 10), ["Profit", "before tax"]);
  assert.deepEqual(wrapWords("Depreciation", 6), ["Depreciation"]);
  assert.deepEqual(wrapWords("Other (associates, minority, discontinued)", 14, 3), ["Other", "(associates,", "minority, discontinued)"]);
  assert.deepEqual(wrapWords("", 10), []);
  assert.ok(wrapWords("a b c d e f g h i j k l", 3, 3).length <= 3);
});

test("columnPath: same commands whatever the height (so growing from zero interpolates), no NaN, rounded only at the data end", () => {
  const flat = columnPath(10, 100, 20, 0, 4);
  const full = columnPath(10, 100, 20, 60, 4);
  const cmds = (p: string) => p.replace(/[-\d.]+/g, "#");
  assert.equal(cmds(flat), cmds(full));
  assert.ok(!/NaN/.test(flat) && !/NaN/.test(full));
  // Rising: the baseline corners are square - the path starts and ends on y=100.
  assert.match(full, /^M10\.00 100\.00 L10\.00 44\.00/);
  assert.match(full, /L30\.00 100\.00 Z$/);
  // Hanging below the baseline mirrors it.
  assert.match(columnPath(10, 100, 20, 60, 4, -1), /^M10\.00 100\.00 L10\.00 156\.00/);
  // A bar shorter than its radius does not overshoot.
  assert.ok(!/NaN/.test(columnPath(0, 50, 10, 2, 4)));
});

test("ordinalRank: best first in the direction that matters, ties share a rank", () => {
  const rows = [{ id: "a", value: 5 }, { id: "b", value: 9 }, { id: "c", value: 5 }, { id: "d", value: 1 }];
  assert.deepEqual(ordinalRank(rows, "higher").map((r) => [r.id, r.rank]), [["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
  assert.deepEqual(ordinalRank(rows, "lower").map((r) => [r.id, r.rank]), [["d", 1], ["a", 2], ["c", 2], ["b", 4]]);
});

test("makeDelta: the right unit for each kind, the right meaning, and nothing when a figure is missing", () => {
  const rev = makeDelta("amount", "higher", 1300, 1000, "FY25")!;
  assert.equal(rev.text, "+30.0%");
  assert.equal(rev.tone, "favorable");
  const margin = makeDelta("percent", "higher", 0.077, 0.08, "FY25")!;
  assert.equal(margin.text, "-0.3pp");
  assert.equal(margin.tone, "unfavorable");
  const days = makeDelta("days", "lower", 40, 32, "FY25")!;
  assert.equal(days.text, "+8d");
  assert.equal(days.tone, "unfavorable"); // more days outstanding is worse
  const payable = makeDelta("days", "neutral", 40, 32, "FY25")!;
  assert.equal(payable.tone, "neutral"); // stretching suppliers is not simply good or bad
  const x = makeDelta("multiple", "higher", 1.25, 1.1, "FY25")!;
  assert.equal(x.text, "+0.15x");
  assert.equal(makeDelta("amount", "higher", 100, 100, "FY25")!.tone, "flat");
  assert.equal(makeDelta("amount", "higher", null, 100, "FY25"), null);
  assert.equal(makeDelta("amount", "higher", 100, 0, "FY25"), null); // a change on zero is undefined, not infinite
});

test("delta chips: text clears 4.5:1 on its own wash", () => {
  assert.ok(contrastRatio(VIZ.favorableText, VIZ.favorableWash) >= 4.5);
  assert.ok(contrastRatio(VIZ.unfavorableText, VIZ.unfavorableWash) >= 4.5);
  assert.ok(contrastRatio(VIZ.textSoft, VIZ.neutralWash) >= 4.5);
});
