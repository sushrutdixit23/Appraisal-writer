// The pure pieces behind the narrative route: cost arithmetic, and the sector-wide reading of a flag.

import test from "node:test";
import assert from "node:assert/strict";
import { normaliseUsage, summariseUsage, turnCostUsd } from "../../app/sentinel/lib/aiUsage";
import { readingFor, sectorPatterns } from "../../app/sentinel/lib/sectorPatterns";
import { renderDecisionMemory } from "../../app/sentinel/lib/decisionMemory";
import type { AnomalyFlag, PeerRow } from "../../app/sentinel/lib/types";

test("usage: null or missing cache fields read as zero, and cache reads bill at a tenth, writes at 1.25x", () => {
  const u = normaliseUsage({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: null });
  assert.deepEqual(u, { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  // 1,000,000 cached-read tokens on a $2/MTok model cost $0.20; 1,000,000 cache-write tokens cost $2.50.
  assert.equal(turnCostUsd("claude-sonnet-5", { ...u, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }), 0.2);
  assert.equal(turnCostUsd("claude-sonnet-5", { ...u, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }), 2.5);
});

test("usage: a model with no price on file makes the total cost unknown, not zero", () => {
  const s = summariseUsage([{ turn: "a", model: "claude-sonnet-5", ...normaliseUsage({ input_tokens: 10, output_tokens: 10 }) }, { turn: "b", model: "some-new-model", ...normaliseUsage({ input_tokens: 10, output_tokens: 10 }) }]);
  assert.equal(s.estimated_cost_usd, null);
  assert.equal(s.total.input_tokens, 20);
});

test("sector reading: needs three companies to say anything, three raising and at least half to call it sector-wide", () => {
  assert.equal(readingFor(2, 2), "inconclusive");
  assert.equal(readingFor(3, 5), "sector_wide");
  assert.equal(readingFor(2, 5), "mixed");
  assert.equal(readingFor(3, 7), "mixed"); // three of seven is under half
  assert.equal(readingFor(1, 5), "company_specific");
});

const flag = (id: string, name: string, type: AnomalyFlag["flag_type"], metric: string): AnomalyFlag => ({
  workspace_id: id, company_name: name, period_label: "FY26", flag_type: type, metric, value: 0.3, threshold: 0.15, severity: 2, description: "d",
});
const row = (id: string): PeerRow => ({ workspace_id: id, company_name: id, period_label: "FY26" } as PeerRow);

test("sector patterns: a peer_outlier is never called sector-wide, and only this period's flags are counted", () => {
  const flags = [
    flag("a", "A", "yoy_swing", "yoy_revenue_growth"), flag("b", "B", "yoy_swing", "yoy_revenue_growth"), flag("c", "C", "yoy_swing", "yoy_revenue_growth"),
    flag("a", "A", "peer_outlier", "ebitda_margin"), flag("b", "B", "peer_outlier", "ebitda_margin"), flag("c", "C", "peer_outlier", "ebitda_margin"),
    { ...flag("d", "D", "yoy_swing", "yoy_revenue_growth"), period_label: "FY25" },
  ];
  const patterns = sectorPatterns(flags, [row("a"), row("b"), row("c"), row("d")], "a", "FY26");
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].metric, "yoy_revenue_growth");
  assert.equal(patterns[0].raised_by, 3);
  assert.equal(patterns[0].of, 4);
  assert.deepEqual(patterns[0].peers_raising.sort(), ["B", "C"]);
  assert.equal(patterns[0].reading, "sector_wide");
});

test("decision memory: nothing decided means no block at all, and the newest decisions come first and are capped", () => {
  assert.equal(renderDecisionMemory([], []), "");
  assert.equal(renderDecisionMemory([{ period_label: "FY25", status: "pending", observation: [], reviewer_notes: null, final_narrative: null, updated_at: null }], []), "");
  const many = Array.from({ length: 6 }, (_, i) => ({
    period_label: `FY${20 + i}`, status: "approved", observation: [], reviewer_notes: null, final_narrative: null, updated_at: `20${20 + i}-01-01T00:00:00Z`,
  }));
  const text = renderDecisionMemory(many, [], 4);
  assert.ok(text.indexOf("FY25") < text.indexOf("FY22"), "newest first");
  assert.ok(!text.includes("FY20") && !text.includes("FY21"), "capped at four");
});
