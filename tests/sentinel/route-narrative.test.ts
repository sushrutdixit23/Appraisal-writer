// /api/sentinel/narrative: who may generate for which company, and which companies end up inside the
// prompt. The Anthropic API is a local fake; the conversation it receives is what is inspected.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/narrative/route";
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
