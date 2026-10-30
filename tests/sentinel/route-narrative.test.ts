// /api/sentinel/narrative: who may generate for which company, and which companies end up inside the
// prompt. The Anthropic API is a local fake; the conversation it receives is what is inspected.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/narrative/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
let wsA = "", wsB = "", wsRef = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  backend.addUser("tok-b", B);
});
after(() => backend.stop());

function fy(workspace_id: string, label: string, end: string, revenue: number, pat: number, extra: Record<string, unknown> = {}) {
  return {
    workspace_id, review_cycle_id: null, period_type: "FY", period_label: label, period_end_date: end, basis: "consolidated",
    revenue_from_operations: revenue, profit_before_tax: pat * 1.3, profit_after_tax: pat, source_file: "t", ...extra,
  };
}

beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  backend.anthropicCalls = [];
  wsA = randomUUID(); wsB = randomUUID(); wsRef = randomUUID();
  const base = { sector: "tyre", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    // Alpha reports in lakh, so its own figures are 100x the crore-scale numbers of the others.
    { id: wsA, owner_id: A, company_name: "Alpha Tyres", is_public_reference: false, currency_unit: "INR_LAKH", ...base },
    { id: wsB, owner_id: B, company_name: "Bravo Secret Tyres", is_public_reference: false, currency_unit: "INR_CRORE", ...base },
    { id: wsRef, owner_id: null, company_name: "Reference Tyres", is_public_reference: true, currency_unit: "INR_CRORE", ...base },
  ];
  backend.tables.sentinel_statements = [
    // Alpha: revenue +30% (1,000,000 -> 1,300,000 lakh = 10,000 -> 13,000 crore) - past the 15% line.
    fy(wsA, "FY26", "2026-03-31", 1_300_000, 100_000),
    fy(wsA, "FY25", "2025-03-31", 1_000_000, 90_000),
    fy(wsRef, "FY26", "2026-03-31", 12_000, 900),
    fy(wsRef, "FY25", "2025-03-31", 11_500, 880),
    // Bravo is another tenant's PRIVATE company, in the same sector, with a wild swing.
    fy(wsB, "FY26", "2026-03-31", 50_000, 9_000),
    fy(wsB, "FY25", "2025-03-31", 5_000, 100),
  ];
  backend.anthropicReply = (body) => {
    const n = body.messages.length;
    if (n === 1) return { text: "Initial hypothesis: growth is company specific." };
    if (n === 3) return { text: "**Rules out sector-wide effect**\n\nAlpha grew faster than the peer set." };
    return {
      text: JSON.stringify({
        questions: ["Was there a one-off order?"],
        recommendations: [{ title: "Check order book", priority: "High", business_value: "Confirms durability", owner: "Finance Head", timeline: "0-2 weeks", difficulty: "Easy" }],
      }),
    };
  };
});

async function call(body: unknown, token: string | null = "tok-a") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(new Request("http://localhost/api/sentinel/narrative", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
}

test("an unauthenticated call is refused before anything else happens", async () => {
  const r = await call({ workspace_id: wsA, period_label: "FY26" }, null);
  assert.equal(r.status, 401);
  assert.equal(backend.anthropicCalls.length, 0);
});

test("a user cannot generate for another user's private company, and no model call is made", async () => {
  const r = await call({ workspace_id: wsB, period_label: "FY26" }, "tok-a");
  assert.equal(r.status, 404);
  assert.equal(backend.anthropicCalls.length, 0);
  assert.equal(backend.rowsOf("sentinel_investigations").length, 0);
});

test("generating for your own company drafts a pending investigation owned by you", async () => {
  const r = await call({ workspace_id: wsA, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [inv] = backend.rowsOf("sentinel_investigations");
  assert.equal(inv.workspace_id, wsA);
  assert.equal(inv.owner_id, A);
  assert.equal(inv.status, "pending");
  assert.equal(typeof inv.confidence_score, "number");
  assert.ok(inv.observation.length > 0);
  assert.ok(inv.observation.every((f: any) => f.workspace_id === wsA), "flags are only about the company asked for");
  assert.match(inv.ai_narrative, /Rules out sector-wide effect/);
  const recs = backend.rowsOf("sentinel_recommendations");
  assert.equal(recs.length, 1);
  assert.equal(recs[0].owner_id, A);
  assert.equal(recs[0].investigation_id, inv.id);
});

test("another tenant's private company never appears in the prompt, the flags or the stored draft", async () => {
  await call({ workspace_id: wsA, period_label: "FY26" });
  const everything = JSON.stringify([backend.anthropicCalls, backend.rowsOf("sentinel_investigations"), backend.rowsOf("sentinel_recommendations")]);
  assert.ok(!everything.includes("Bravo"), "company name leaked");
  assert.ok(!everything.includes("50,000") && !everything.includes("50000"), "its figures leaked");
  assert.ok(everything.includes("Reference Tyres"), "the public reference company is still the peer");
});

test("the model is shown the company's own figures in ITS unit and peers in crore", async () => {
  await call({ workspace_id: wsA, period_label: "FY26" });
  const first = backend.anthropicCalls[0].messages[0].content as string;
  assert.match(first, /Revenue: ₹13,00,000\.0 lakh/);
  assert.match(first, /Prior year \(FY25\): Revenue ₹10,00,000\.0 lakh/);
  // The flag text is built from crore-normalised rows: 13,000 cr vs 10,000 cr is +30%.
  assert.match(first, /revenue growth grew 30\.0% YoY/);
});

test("a reference company can be analysed by anyone, and a draft is saved for the caller, not for the reference", async () => {
  // Make the reference company swing so it has a flag.
  backend.tables.sentinel_statements = backend.rowsOf("sentinel_statements").map((s) =>
    s.workspace_id === wsRef && s.period_label === "FY26" ? { ...s, revenue_from_operations: 16_000 } : s
  );
  const r = await call({ workspace_id: wsRef, period_label: "FY26" }, "tok-b");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const inv = backend.rowsOf("sentinel_investigations").at(-1)!;
  assert.equal(inv.workspace_id, wsRef);
  assert.equal(inv.owner_id, B);
});

test("no flags for the period is a 404 with no model call; a malformed body is a 400", async () => {
  assert.equal((await call({ workspace_id: wsA, period_label: "FY19" })).status, 404);
  assert.equal(backend.anthropicCalls.length, 0);
  assert.equal((await call({ workspace_id: wsA })).status, 400);
  assert.equal((await call({ workspace_id: "nope", period_label: "FY26" })).status, 404);
});

// ---------------------------------------------------------------------------------------------
// Round 2: cost measurement, the cheaper follow-up model, decision memory, sector patterns, and a
// database that is missing the newest columns.
// ---------------------------------------------------------------------------------------------

test("the three turns are metered, the JSON follow-up runs on the cheapest model, and the cost is computed from real usage", async () => {
  backend.anthropicReply = (body) => {
    const usage = { input_tokens: 1000, output_tokens: 200 };
    const n = body.messages.length;
    if (n === 1) return { text: "Initial hypothesis: growth is company specific.", usage };
    if (n === 3) return { text: "**Rules out sector-wide effect**\n\nAlpha grew faster than the peer set.", usage };
    return { text: JSON.stringify({ questions: ["q?"], recommendations: [] }), usage };
  };
  const r = await call({ workspace_id: wsA, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(backend.anthropicCalls.map((c) => c.model), ["claude-sonnet-5", "claude-sonnet-5", "claude-haiku-5-5"]);
  assert.deepEqual(r.json.usage.turns.map((t: any) => t.turn), ["hypothesis", "narrative", "follow_ups"]);
  assert.equal(r.json.usage.total.input_tokens, 3000);
  assert.equal(r.json.usage.total.output_tokens, 600);
  // Two Sonnet turns at $2/$10 and one Haiku turn at $0.10/$0.50 per million tokens, worked by hand:
  // 2 x (1000x2 + 200x10)/1e6 + (1000x0.1 + 200x0.5)/1e6 = 0.008 + 0.0002
  assert.equal(r.json.usage.estimated_cost_usd, 0.0082);
  assert.equal(backend.rowsOf("sentinel_investigations")[0].generation_usage.estimated_cost_usd, 0.0082);
});

test("if the cheap follow-up model fails, the same turn is retried on the main model and the follow-ups still arrive", async () => {
  backend.anthropicReply = (body) => {
    if (body.model === "claude-haiku-5-5") return { json: { type: "error", error: { type: "invalid_request_error", message: "nope" } }, status: 400 };
    const n = body.messages.length;
    if (n === 1) return { text: "Initial hypothesis." };
    if (n === 3) return { text: "**Rules out sector-wide effect**\n\nCompany specific." };
    return { text: JSON.stringify({ questions: ["Was it a one-off?"], recommendations: [] }) };
  };
  const r = await call({ workspace_id: wsA, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(backend.anthropicCalls.map((c) => c.model), ["claude-sonnet-5", "claude-sonnet-5", "claude-haiku-5-5", "claude-sonnet-5"]);
  assert.deepEqual(backend.rowsOf("sentinel_investigations")[0].suggested_questions, ["Was it a one-off?"]);
});

test("decision memory: a reviewer's earlier decision and note on this company reach the prompt - and only that reviewer's", async () => {
  backend.tables.sentinel_investigations = [
    { id: randomUUID(), workspace_id: wsA, owner_id: A, period_label: "FY25", status: "rejected", updated_at: "2025-06-01T00:00:00Z",
      observation: [{ flag_type: "yoy_swing", metric: "yoy_revenue_growth", description: "x" }],
      reviewer_notes: "One-off export order, not repeatable.", final_narrative: null },
    { id: randomUUID(), workspace_id: wsA, owner_id: B, period_label: "FY24", status: "approved", updated_at: "2024-06-01T00:00:00Z",
      observation: [], reviewer_notes: "SECRET note from another reviewer", final_narrative: null },
    { id: randomUUID(), workspace_id: wsA, owner_id: A, period_label: "FY23", status: "pending", updated_at: "2023-06-01T00:00:00Z",
      observation: [], reviewer_notes: "an undecided draft", final_narrative: null },
  ];
  await call({ workspace_id: wsA, period_label: "FY26" });
  const first = backend.anthropicCalls[0].messages[0].content as string;
  assert.match(first, /FY25: REJECTED by the reviewer/);
  assert.match(first, /One-off export order, not repeatable\./);
  assert.match(first, /The same flag recurs today: yoy_revenue_growth/);
  assert.ok(!first.includes("SECRET"), "another reviewer's decision leaked");
  assert.ok(!first.includes("an undecided draft"), "an undecided draft was treated as a decision");
});

test("sector patterns: the count of companies raising the same flag is computed and handed to the model as fact", async () => {
  const base = { sector: "tyre", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", owner_id: null, is_public_reference: true, currency_unit: "INR_CRORE" };
  for (const name of ["Peer One", "Peer Two", "Peer Three"]) {
    const id = randomUUID();
    backend.tables.sentinel_workspaces.push({ id, company_name: name, ...base });
    backend.tables.sentinel_statements.push(fy(id, "FY26", "2026-03-31", 13_000, 900), fy(id, "FY25", "2025-03-31", 10_000, 880));
  }
  await call({ workspace_id: wsA, period_label: "FY26" });
  const second = backend.anthropicCalls[1].messages[2].content as string;
  assert.match(second, /yoy_revenue_growth \(yoy_swing\): raised by 4 of 5 companies with FY26 on file/);
  assert.match(second, /SECTOR-WIDE pattern/);
});

test("a database missing the newest columns still saves the investigation, just without them", async () => {
  backend.failNext = {
    table: "sentinel_investigations", method: "POST", status: 400,
    body: { code: "PGRST204", message: "Could not find the 'generation_usage' column of 'sentinel_investigations' in the schema cache" },
  };
  const r = await call({ workspace_id: wsA, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [inv] = backend.rowsOf("sentinel_investigations");
  assert.equal(inv.status, "pending");
  assert.ok(!("generation_usage" in inv) && !("grounding_warnings" in inv), "the optional columns were not left in the retry");
});

test("working-capital evidence: last year's days, the receivables-vs-revenue gap, each peer's basis and the definition caveat reach the prompt", async () => {
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", currency_unit: "INR_CRORE" };
  const subject = randomUUID(), standalonePeer = randomUUID(), plainPeer = randomUUID();
  backend.tables.sentinel_workspaces = [
    { id: subject, owner_id: A, company_name: "Tech Subject", is_public_reference: false, ...base },
    { id: standalonePeer, owner_id: null, company_name: "Standalone Peer", is_public_reference: true, ...base },
    { id: plainPeer, owner_id: null, company_name: "Plain Peer", is_public_reference: true, ...base },
  ];
  backend.tables.sentinel_statements = [
    // Days: FY25 200/900*365 = 81.11, FY26 300/1000*365 = 109.5; receivables +50%, revenue +11.1%.
    fy(subject, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 300 }),
    fy(subject, "FY25", "2025-03-31", 900, 90, { trade_receivables: 200 }),
    fy(standalonePeer, "FY26", "2026-03-31", 1000, 100, { basis: "standalone", trade_receivables: 200, unbilled_revenue: 80 }),
    fy(standalonePeer, "FY25", "2025-03-31", 950, 95, { basis: "standalone", trade_receivables: 190, unbilled_revenue: 70 }),
    fy(plainPeer, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 200 }),
    fy(plainPeer, "FY25", "2025-03-31", 950, 95, { trade_receivables: 190 }),
  ];
  const r = await call({ workspace_id: subject, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const first = backend.anthropicCalls[0].messages[0].content as string;
  assert.match(first, /receivable_days: 81\.11 in FY25 -> 109\.50 in FY26/);
  assert.match(first, /Trade receivables \+50\.00% against revenue \+11\.11% year on year/);
  const second = backend.anthropicCalls[1].messages[2].content as string;
  assert.match(second, /Standalone Peer \(standalone\): /);
  assert.match(second, /Tech Subject \(consolidated\): 109\.50 <- flagged company/);
  assert.match(second, /peers are not all on the same basis/);
  assert.match(second, /unbilled-revenue line is on file for Standalone Peer but not for Tech Subject, Plain Peer/);
});

test("with no unbilled line on file anywhere, the standing receivables-definition caveat and the materiality note still reach the prompt", async () => {
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", currency_unit: "INR_CRORE" };
  const subject = randomUUID(), peer = randomUUID();
  backend.tables.sentinel_workspaces = [
    { id: subject, owner_id: A, company_name: "Tech Subject", is_public_reference: false, ...base },
    { id: peer, owner_id: null, company_name: "Plain Peer", is_public_reference: true, ...base },
  ];
  backend.tables.sentinel_statements = [
    fy(subject, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 300 }), // 109.5 days, above 105 x 1.03 = 108.15
    fy(subject, "FY25", "2025-03-31", 900, 90, { trade_receivables: 200 }),
    fy(peer, "FY26", "2026-03-31", 1000, 100, { trade_receivables: 250 }),
    fy(peer, "FY25", "2025-03-31", 950, 95, { trade_receivables: 240 }),
  ];
  const r = await call({ workspace_id: subject, period_label: "FY26" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const second = backend.anthropicCalls[1].messages[2].content as string;
  assert.match(second, /Receivable days may not be like-for-like across these companies: whether each company's trade receivables include unbilled revenue is not recorded here/);
  assert.match(second, /Do not state or imply that the definitions match/);
  assert.match(second, /more than 3% - a peer slightly above the line \(for example 105\.16 against 105\)/);
});

test("what the auditor's report raised reaches the prompt in the auditor's own words; a clean report adds nothing", async () => {
  const stmts = backend.tables.sentinel_statements;
  const own = stmts.find((s) => s.workspace_id === wsA && s.period_label === "FY26")!;
  own.annual_report_checks = JSON.stringify({ o: "qualified", f: [{ id: "qualified", s: "high", t: "The auditor has qualified the opinion", d: "The Company has not provided for doubtful advances of Rs 120 crore.", p: 9 }] });
  await call({ workspace_id: wsA, period_label: "FY26" });
  const first = backend.anthropicCalls[0].messages[0].content as string;
  assert.match(first, /What the auditor's report raises for this filing/);
  assert.match(first, /The auditor has qualified the opinion: "The Company has not provided for doubtful advances of Rs 120 crore\."/);
  backend.anthropicCalls = [];
  own.annual_report_checks = JSON.stringify({ o: "unmodified", f: [{ id: "unmodified", s: "info", t: "clean", d: "clean", p: 9 }] });
  await call({ workspace_id: wsA, period_label: "FY26" });
  assert.doesNotMatch(backend.anthropicCalls[0].messages[0].content as string, /auditor's report raises/);
});
