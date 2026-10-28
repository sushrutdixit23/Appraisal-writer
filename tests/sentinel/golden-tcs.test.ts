// A golden case: TCS's STANDALONE FY26 and FY25 figures, hand-read from its Integrated Annual Report 2025-26 (standalone
// balance sheet, profit and loss and cash flow, pp. 252-257), run with the shipped reference peers through the real
// pipeline. The expected numbers below are worked out from the filing's own figures, not copied from the code under test:
//
//   receivable days FY26 = 57,177 / 220,938 x 365 = 94.46      FY25 = 51,902 / 214,853 x 365 = 88.17
//   receivables growth   = 57,177 / 51,902 - 1   = +10.16%     revenue growth = 220,938 / 214,853 - 1 = +2.83%
//
// HCLTech (consolidated, Rs million): 90.14 days against the 90-day line - inside the materiality margin, so no flag.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "../../app/api/sentinel/narrative/route";
import { runAllChecks } from "../../app/sentinel/lib/anomaly";
import { buildPeerTable } from "../../app/sentinel/lib/engine";
import { buildSeedCompany, type SeedEntry } from "../../app/sentinel/lib/referenceSeed";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import type { FinancialStatement, Workspace } from "../../app/sentinel/lib/types";
import { FakeBackend, useBackend } from "./fake-backend";

const refDir = join(process.cwd(), "data", "reference-universe");
const manifest = JSON.parse(readFileSync(join(refDir, "manifest.json"), "utf-8")) as SeedEntry[];
const peers = manifest.filter((e) => e.company_name !== "TCS").map((e) => buildSeedCompany(e, readFileSync(join(refDir, e.csv), "utf-8")));
const tcs = buildSeedCompany(
  { company_name: "TCS", sector: "technology", industry: "IT services", unit: "INR_CRORE", basis: "standalone", csv: "tcs-standalone-fy26-fy25.csv", source: "TCS Integrated Annual Report 2025-26, standalone pp. 252-257." },
  readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "tcs-standalone-fy26-fy25.csv"), "utf-8")
);

const A = randomUUID();
const backend = new FakeBackend();
const wsOf = (e: SeedEntry, owner: string | null): Workspace =>
  ({ id: randomUUID(), owner_id: owner, company_name: e.company_name, sector: "technology", industry: e.industry, is_public_reference: owner === null, fiscal_year_start_month: 4, currency: "INR", currency_unit: e.unit, comparison_basis: e.basis } as unknown as Workspace);

let subject: Workspace, workspaces: Workspace[], statements: FinancialStatement[];
beforeEach(() => {
  resetRateLimits();
  subject = wsOf(tcs.entry, A);
  const peerWs = peers.map((p) => wsOf(p.entry, null));
  workspaces = [subject, ...peerWs];
  statements = [
    ...tcs.rows.map((r) => ({ ...r, id: randomUUID(), workspace_id: subject.id, review_cycle_id: null }) as unknown as FinancialStatement),
    ...peers.flatMap((p, i) => p.rows.map((r) => ({ ...r, id: randomUUID(), workspace_id: peerWs[i].id, review_cycle_id: null }) as unknown as FinancialStatement)),
  ];
});
before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); });
after(() => backend.stop());

test("the TCS standalone figures read from the filing give 94.46 and 88.17 receivable days and a +10.2% vs +2.8% gap", () => {
  const table = buildPeerTable(workspaces, statements, subject.id, "FY");
  const row = table.find((r) => r.workspace_id === subject.id)!;
  assert.equal(row.basis, "standalone");
  assert.ok(Math.abs((row.ratios["receivable_days"] as number) - 94.46) < 0.01);
  const fy25 = statements.find((s) => s.workspace_id === subject.id && s.period_label === "FY25")!;
  assert.ok(Math.abs((fy25.trade_receivables! / fy25.revenue_from_operations) * 365 - 88.17) < 0.01);
});

test("TCS at 94.46 days flags (4.9% over the 90-day line); HCLTech at 90.14 does not (0.2% over, rounding)", () => {
  const flags = runAllChecks(buildPeerTable(workspaces, statements, subject.id, "FY"), "technology");
  const rec = flags.filter((f) => f.metric === "receivable_days");
  assert.deepEqual(rec.map((f) => f.company_name), ["TCS"]);
  assert.match(rec[0].description, /receivable days of 94 exceed the configured 90-day threshold/);
});

test("the prompt the model sees carries the filing-derived trend, the gap, and every peer's basis", async () => {
  backend.tables = { sentinel_workspaces: workspaces as any, sentinel_statements: statements as any };
  backend.anthropicCalls = [];
  backend.anthropicReply = (body) => {
    const n = body.messages.length;
    if (n === 1) return { text: "Receivables grew faster than revenue." };
    if (n === 3) return { text: "**Points to something else**\n\nReceivable days rose from 88.17 to 94.46. The peer set mixes standalone and consolidated bases." };
    return { text: JSON.stringify({ questions: ["How much of the balance is unbilled?"], recommendations: [] }) };
  };
  const res = await POST(new Request("http://localhost/api/sentinel/narrative", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok-a" }, body: JSON.stringify({ workspace_id: subject.id, period_label: "FY26" }) }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const first = backend.anthropicCalls[0].messages[0].content as string;
  const second = backend.anthropicCalls[1].messages[2].content as string;
  assert.match(first, /receivable_days: 88\.17 in FY25 -> 94\.46 in FY26/);
  assert.match(first, /Trade receivables \+10\.2% against revenue \+2\.8% year on year \(receivables ahead of revenue by 7\.3 points\)/);
  assert.match(second, /TCS \(standalone\): 94\.46 <- flagged company/);
  assert.match(second, /Wipro \(consolidated\): /);
  assert.match(second, /HCLTech \(consolidated\): 90\.14/);
  assert.match(second, /peers are not all on the same basis/);
});
