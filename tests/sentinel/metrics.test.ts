// Operating metrics: the parser, the narrative context, and the route's ownership rules.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DELETE, POST } from "../../app/api/sentinel/metrics/route";
import { formatMetricValue, operatingContext, parseMetricInput } from "../../app/sentinel/lib/metrics";
import { FakeBackend, useBackend } from "./fake-backend";

test("a preset metric is checked against its kind: percentages are 0 to 100, counts and amounts are not negative", () => {
  assert.equal(parseMetricInput({ period_label: "Q3 FY26", metric: "attrition_pct", value: 13.5 }).ok, true);
  assert.equal(parseMetricInput({ period_label: "Q3 FY26", metric: "attrition_pct", value: 135 }).ok, false);
  assert.equal(parseMetricInput({ period_label: "Q3 FY26", metric: "utilisation_pct", value: -1 }).ok, false);
  assert.equal(parseMetricInput({ period_label: "Q3 FY26", metric: "headcount", value: -5 }).ok, false);
  const ok = parseMetricInput({ period_label: "Q3 FY26", metric: "headcount", value: "3,12,000", source: "  Q3 deck p.12 " });
  assert.ok(ok.ok && ok.row.value === 312000 && ok.row.unit === "people" && ok.row.source === "Q3 deck p.12");
});

test("a custom metric is allowed by name; blanks, non-numbers and over-long names are refused", () => {
  const custom = parseMetricInput({ period_label: "FY26", metric: "Bench strength", value: 4.2 });
  assert.ok(custom.ok && custom.row.unit === null);
  assert.equal(parseMetricInput({ period_label: "", metric: "headcount", value: 1 }).ok, false);
  assert.equal(parseMetricInput({ period_label: "FY26", metric: "", value: 1 }).ok, false);
  assert.equal(parseMetricInput({ period_label: "FY26", metric: "x".repeat(61), value: 1 }).ok, false);
  assert.equal(parseMetricInput({ period_label: "FY26", metric: "headcount", value: "lots" }).ok, false);
  assert.equal(parseMetricInput({ period_label: "FY26", metric: "headcount", value: "" }).ok, false);
  assert.equal(parseMetricInput(null).ok, false);
});

test("values print the way the preset reads: a percent with its sign, a count with Indian grouping", () => {
  assert.equal(formatMetricValue({ metric: "attrition_pct", value: 13.5 }), "13.5%");
  assert.equal(formatMetricValue({ metric: "headcount", value: 312000 }), "3,12,000");
});

test("the narrative context lists the latest value of each metric, says the rest are unknown, and is empty with none", () => {
  assert.equal(operatingContext([]), "");
  const text = operatingContext([
    { period_label: "Q2 FY26", metric: "attrition_pct", value: 14, unit: "%", source: null },
    { period_label: "Q3 FY26", metric: "attrition_pct", value: 13.5, unit: "%", source: "Q3 deck p.12" },
    { period_label: "Q3 FY26", metric: "headcount", value: 312000, unit: "people", source: null },
  ]);
  assert.match(text, /Attrition \(last twelve months\) \(Q3 FY26\): 13\.5% \[source: Q3 deck p\.12\]/);
  assert.doesNotMatch(text, /14%/);
  assert.match(text, /Headcount \(Q3 FY26\): 3,12,000/);
  assert.match(text, /any other operating measure.*unknown and must not be assumed/);
});

// --- the route ------------------------------------------------------------------------------

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
backend.unique = { ...backend.unique, sentinel_operating_metrics: ["workspace_id", "period_label", "metric"] };
let wsA = "", wsB = "", wsRef = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  backend.addUser("tok-b", B);
});
after(() => backend.stop());
beforeEach(() => {
  backend.tables = {};
  backend.failNext = null;
  wsA = randomUUID(); wsB = randomUUID(); wsRef = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
  backend.tables.sentinel_workspaces = [
    { id: wsA, owner_id: A, company_name: "Alpha", is_public_reference: false, ...base },
    { id: wsB, owner_id: B, company_name: "Bravo", is_public_reference: false, ...base },
    { id: wsRef, owner_id: null, company_name: "Reference", is_public_reference: true, ...base },
  ];
});

async function send(fn: typeof POST, body: unknown, token: string | null = "tok-a") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fn(new Request("http://x/api/sentinel/metrics", { method: fn === POST ? "POST" : "DELETE", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
}
const metrics = () => backend.rowsOf("sentinel_operating_metrics");

test("the owner records a metric, and recording it again for the same period replaces it", async () => {
  const body = { workspace_id: wsA, period_label: "Q3 FY26", metric: "attrition_pct", value: 13.5 };
  assert.equal((await send(POST, body)).status, 200);
  assert.equal((await send(POST, { ...body, value: 12 })).status, 200);
  assert.equal(metrics().length, 1);
  assert.equal(metrics()[0].value, 12);
  assert.equal(metrics()[0].created_by, A);
});

test("nobody records into someone else's company or a reference company, and an unauthenticated call is refused", async () => {
  const body = { period_label: "Q3 FY26", metric: "headcount", value: 100 };
  assert.equal((await send(POST, { ...body, workspace_id: wsB })).status, 404);
  assert.equal((await send(POST, { ...body, workspace_id: wsRef })).status, 403);
  assert.equal((await send(POST, { ...body, workspace_id: wsA }, null)).status, 401);
  assert.equal(metrics().length, 0);
});

test("an invalid metric is a 422 and stores nothing", async () => {
  const r = await send(POST, { workspace_id: wsA, period_label: "Q3 FY26", metric: "attrition_pct", value: 400 });
  assert.equal(r.status, 422);
  assert.equal(metrics().length, 0);
});

test("removing a metric deletes only that company's row", async () => {
  await send(POST, { workspace_id: wsA, period_label: "Q3 FY26", metric: "headcount", value: 100 });
  await send(POST, { workspace_id: wsB, period_label: "Q3 FY26", metric: "headcount", value: 200 }, "tok-b");
  assert.equal((await send(DELETE, { workspace_id: wsA, period_label: "Q3 FY26", metric: "headcount" })).status, 200);
  assert.deepEqual(metrics().map((m) => m.workspace_id), [wsB]);
  assert.equal((await send(DELETE, { workspace_id: wsB, period_label: "Q3 FY26", metric: "headcount" })).status, 404);
  assert.equal(metrics().length, 1);
});

test("before the migration the table is missing: a clear 503, not a crash", async () => {
  backend.failNext = { table: "sentinel_operating_metrics", method: "POST", status: 404, body: { code: "PGRST205", message: "Could not find the table" } };
  const r = await send(POST, { workspace_id: wsA, period_label: "Q3 FY26", metric: "headcount", value: 100 });
  assert.equal(r.status, 503);
  assert.match(r.json.error, /database step/);
});
