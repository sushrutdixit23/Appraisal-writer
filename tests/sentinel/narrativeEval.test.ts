// Narrative evaluation. Part one grades scripted good and bad narratives with the scorer (always runs, no model).
// Part two sends fixed cases through the real narrative route and grades what comes back: with scripted replies by
// default, and against the live Anthropic API when SENTINEL_EVAL_LIVE=1 and ANTHROPIC_API_KEY are set (opt-in, costs
// a few cents, and is the only run that says anything about the model itself):
//
//   SENTINEL_EVAL_LIVE=1 ANTHROPIC_API_KEY=... npm run test:sentinel -- --test-name-pattern "live evaluation"

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/narrative/route";
import { scoreNarrative } from "../../app/sentinel/lib/narrativeEval";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const PROMPT =
  "receivable days of 110 exceed the configured 90-day threshold\n" +
  "How the flagged measures moved from the prior year (computed from the filings, same basis):\n  receivable_days: 81.11 in FY25 -> 109.50 in FY26\n" +
  "Wipro (consolidated): 85.00\nTCS (standalone): 109.50\n" +
  "The peers are not all on the same basis: TCS (standalone), Wipro (consolidated).\n" +
  "Receivable days may not be like-for-like across these peers: an unbilled-revenue line is on file for TCS but not for Wipro.";

const GOOD =
  "**Points to something else**\n\nReceivable days rose from 81.11 in FY25 to 109.50 in FY26, a 28-day lengthening. " +
  "TCS is on a standalone basis while Wipro is consolidated at 85.00 days, and only TCS has an unbilled-revenue line, so part of the gap may be a definition difference. " +
  "Ask finance how much of the receivable balance is unbilled.";

test("scorer: a narrative that uses the trend, names the basis, hedges the definition and cites only given figures passes", () => {
  const s = scoreNarrative(GOOD, PROMPT);
  assert.equal(s.passed, true, JSON.stringify(s.checks.filter((c) => !c.ok)));
  assert.deepEqual(s.checks.map((c) => c.id), ["verdict", "length", "grounded", "uses_trend", "names_basis", "hedges_definition"]);
});

test("scorer: each failure is named - no verdict, an invented figure, trend ignored, basis unnamed, definition gap treated as settled", () => {
  const bad = "TCS collects slowly at 62 days against peers, and collections are clearly worsening. Management must act now.";
  const s = scoreNarrative(bad, PROMPT);
  const failed = s.checks.filter((c) => !c.ok).map((c) => c.id).sort();
  assert.deepEqual(failed, ["grounded", "hedges_definition", "names_basis", "uses_trend", "verdict"].sort());
  assert.equal(s.passed, false);
});

test("scorer: expectations follow the prompt - a plain single-basis prompt does not demand a basis or a hedge", () => {
  const s = scoreNarrative("**Rules out sector-wide effect**\n\nGrowth was company specific. The peers grew slower.", "yoy_revenue_growth: +15.2%");
  assert.equal(s.passed, true, JSON.stringify(s.checks));
  assert.deepEqual(s.checks.map((c) => c.id), ["verdict", "length", "grounded"]);
});

// ---- through the real route ---------------------------------------------------------------------------------------

const live = process.env.SENTINEL_EVAL_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;
const A = randomUUID();
const backend = new FakeBackend();
before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); });
after(() => backend.stop());

const fy = (workspace_id: string, label: string, end: string, revenue: number, pat: number, extra: Record<string, unknown> = {}) => ({
  workspace_id, review_cycle_id: null, period_type: "FY", period_label: label, period_end_date: end, basis: "consolidated",
  revenue_from_operations: revenue, profit_before_tax: pat * 1.3, profit_after_tax: pat, source_file: "t", ...extra,
});

let subject = "";
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  backend.anthropicCalls = [];
  backend.anthropicForward = null;
  subject = randomUUID();
  const peerA = randomUUID(), peerB = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", currency_unit: "INR_CRORE" };
  backend.tables.sentinel_workspaces = [
    { id: subject, owner_id: A, company_name: "Tech Subject", is_public_reference: false, ...base },
    { id: peerA, owner_id: null, company_name: "Standalone Peer", is_public_reference: true, ...base },
    { id: peerB, owner_id: null, company_name: "Plain Peer", is_public_reference: true, ...base },
  ];
  backend.tables.sentinel_statements = [
    fy(subject, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 300 }),
    fy(subject, "FY25", "2025-03-31", 900, 90, { trade_receivables: 200 }),
    fy(peerA, "FY26", "2026-03-31", 1000, 100, { basis: "standalone", trade_receivables: 220, unbilled_revenue: 80 }),
    fy(peerA, "FY25", "2025-03-31", 950, 95, { basis: "standalone", trade_receivables: 200, unbilled_revenue: 70 }),
    fy(peerB, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 210 }),
    fy(peerB, "FY25", "2025-03-31", 950, 95, { trade_receivables: 200 }),
  ];
});

async function generate(): Promise<{ narrative: string; prompt: string }> {
  const res = await POST(new Request("http://localhost/api/sentinel/narrative", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-a" },
    body: JSON.stringify({ workspace_id: subject, period_label: "FY26" }),
  }));
  const json = (await res.json()) as { error?: string };
  assert.equal(res.status, 200, JSON.stringify(json));
  const calls = backend.anthropicCalls;
  const prompt = [calls[0].messages[0].content, calls[1].messages[2].content].join("\n\n");
  const narrative = calls[1].messages[2] ? (backend.rowsOf("sentinel_investigations")[0].ai_narrative as string) : "";
  return { narrative, prompt };
}

test("the route's prompt carries everything the scorer will demand, and a scripted answer is graded on the structure it was asked for", async () => {
  backend.anthropicReply = (body) => {
    const n = body.messages.length;
    if (n === 1) return { text: "Receivables outgrew revenue." };
    if (n === 3) return { text: GOOD.replace("TCS", "Tech Subject").replace("Wipro", "Standalone Peer") };
    return { text: JSON.stringify({ questions: ["How much is unbilled?"], recommendations: [] }) };
  };
  const { narrative, prompt } = await generate();
  const s = scoreNarrative(narrative, prompt);
  // The scripted figures belong to the PROMPT constant above, not this data, so only the structural checks are asserted here.
  assert.ok(s.checks.find((c) => c.id === "uses_trend"), "the prompt has a trend block, so the trend is demanded");
  assert.ok(s.checks.find((c) => c.id === "names_basis"), "the peers are on mixed bases, so the basis is demanded");
  assert.ok(s.checks.find((c) => c.id === "hedges_definition"), "only some peers carry unbilled revenue, so the hedge is demanded");
  assert.equal(s.checks.find((c) => c.id === "verdict")!.ok, true);
});

test("live evaluation: the real model's narrative on the mixed-basis working-capital case", { skip: !live }, async () => {
  backend.anthropicForward = async (body) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    return { json: await r.json(), status: r.status };
  };
  const { narrative, prompt } = await generate();
  const s = scoreNarrative(narrative, prompt);
  console.log(`# live narrative:\n${narrative}\n# scorecard: ${s.checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.id} (${c.detail})`).join(" | ")}`);
  assert.equal(s.passed, true, JSON.stringify(s.checks.filter((c) => !c.ok)));
});
