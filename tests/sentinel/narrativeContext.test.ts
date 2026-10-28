// The evidence blocks the narrative prompt carries, against hand-computed cases.

import test from "node:test";
import assert from "node:assert/strict";
import { basisNote, formatMetricValue, materialityNote, receivablesDefinitionNote, receivablesGrowthGap, receivablesStandingCaveat, trendBlock } from "../../app/sentinel/lib/narrativeContext";
import type { PeerRow } from "../../app/sentinel/lib/types";
import { near, st } from "./helpers";

// Prior: revenue 1000, receivables 200 -> 73 days. Now: revenue 1100 (+10%), receivables 300 (+50%) -> 99.5 days.
const prior = st("a", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 1000, trade_receivables: 200 });
const now = st("a", { revenue_from_operations: 1100, trade_receivables: 300 });

test("receivables growth gap: +50% against +10% is 40 points ahead", () => {
  const g = receivablesGrowthGap(now, prior)!;
  assert.ok(near(g.receivables, 0.5));
  assert.ok(near(g.revenue, 0.1));
  assert.ok(near(g.gapPoints, 40));
});

test("receivables growth gap: no prior year, or no receivables last year, is null", () => {
  assert.equal(receivablesGrowthGap(now, null), null);
  assert.equal(receivablesGrowthGap(now, { ...prior, trade_receivables: null }), null);
  assert.equal(receivablesGrowthGap(now, { ...prior, trade_receivables: 0 }), null);
});

test("trend block: last year's receivable days beside this year's, and the growth gap", () => {
  const text = trendBlock(now, prior, null, "technology", ["receivable_days"]);
  assert.match(text, /receivable_days: 73\.00 in FY25 -> 99\.55 in FY26/);
  assert.match(text, /Trade receivables \+50\.00% against revenue \+10\.00% year on year \(receivables ahead of revenue by 40\.00 points\)/);
});

test("trend block: nothing without a prior year, nothing for a metric that cannot be computed last year", () => {
  assert.equal(trendBlock(now, null, null, "technology", ["receivable_days"]), "");
  assert.equal(trendBlock(now, { ...prior, trade_receivables: null }, null, "technology", ["receivable_days"]), "");
});

test("trend block: the growth comparison appears only when receivable days are the flag", () => {
  assert.doesNotMatch(trendBlock(now, prior, null, "technology", ["inventory_days"]), /Trade receivables/);
});

test("formatMetricValue: growth as a signed percentage, days as a plain number", () => {
  assert.equal(formatMetricValue("revenue_yoy", 0.028), "+2.8%");
  assert.equal(formatMetricValue("receivable_days", 94.5), "94.50");
});

function peer(name: string, over: Partial<PeerRow> = {}): PeerRow {
  return {
    workspace_id: name, company_name: name, is_subject: false, period_label: "FY26", basis: "consolidated", basis_caveat: null,
    revenue_cr: 1000, pat_cr: 100, pbt_cr: 120, exceptional_items_cr: 0, prior_revenue_cr: null, prior_pat_cr: null,
    total_equity_cr: null, unbilled_revenue_cr: null, prior_unbilled_revenue_cr: null, has_prior_year: false,
    ratios: { receivable_days: 80 }, ...over,
  };
}

test("receivables definition: an unbilled line for some peers and not others is called out by name", () => {
  const note = receivablesDefinitionNote([peer("TCS", { unbilled_revenue_cr: 5000 }), peer("Infosys"), peer("Wipro", { unbilled_revenue_cr: 300 })])!;
  assert.match(note, /on file for TCS, Wipro but not for Infosys/);
  assert.match(note, /definition difference/);
});

test("receivables definition: silent when every peer has the line, none has it, or only one has receivable days", () => {
  assert.equal(receivablesDefinitionNote([peer("A", { unbilled_revenue_cr: 1 }), peer("B", { unbilled_revenue_cr: 2 })]), null);
  assert.equal(receivablesDefinitionNote([peer("A"), peer("B")]), null);
  assert.equal(receivablesDefinitionNote([peer("A", { unbilled_revenue_cr: 1 }), peer("B", { ratios: {} })]), null);
});

test("basis note: lists each peer's basis when they differ, silent when they agree", () => {
  const note = basisNote([peer("TCS", { basis: "standalone" }), peer("Wipro")])!;
  assert.match(note, /TCS \(standalone\), Wipro \(consolidated\)/);
  assert.match(note, /compare ratios, not absolute amounts/);
  assert.equal(basisNote([peer("A"), peer("B")]), null);
});

test("standing caveat: names the billed-versus-billed-plus-unbilled difference and forbids asserting matching definitions", () => {
  const t = receivablesStandingCaveat();
  assert.match(t, /^Receivable days may not be like-for-like across these companies/);
  assert.match(t, /billed only, or billed plus unbilled/);
  assert.match(t, /Do not state or imply that the definitions match/);
});

test("the specific note keeps the same lead phrase and the same instruction as the standing caveat", () => {
  const note = receivablesDefinitionNote([peer("TCS", { unbilled_revenue_cr: 5000 }), peer("Infosys")])!;
  assert.match(note, /^Receivable days may not be like-for-like across these companies/);
  assert.match(note, /Do not state or imply that the definitions match/);
});

test("materiality note: says 3% and tells the model not to call a peer just over the line a breach", () => {
  assert.match(materialityNote(), /more than 3%/);
  assert.match(materialityNote(), /90\.14 against 90/);
});
