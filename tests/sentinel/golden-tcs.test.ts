// A golden case: TCS's STANDALONE FY26 and FY25 figures, hand-read from its Integrated Annual Report 2025-26 (standalone
// balance sheet, profit and loss and cash flow, pp. 252-257), run with the shipped reference peers through the real
// pipeline. The expected numbers below are worked out from the filing's own figures, not copied from the code under test:
//
//   receivable days FY26 = 57,177 / 220,938 x 365 = 94.46      FY25 = 51,902 / 214,853 x 365 = 88.17
//   receivables growth   = 57,177 / 51,902 - 1   = +10.16%     revenue growth = 220,938 / 214,853 - 1 = +2.83%
//
// On the billed-plus-unbilled definition used for every company here, the ceiling for IT services is 105 days (flags above
// 108.15 with the 3% margin): TCS 94.46, HCLTech 90.14, Wipro 86.89, Tech Mahindra 87.51 and Infosys 108.02 (standalone,
// unbilled added from its credit-risk note) - the highest of the five, still 0.1 day inside the margin, so nothing flags.

import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAllChecks } from "../../app/sentinel/lib/anomaly";
import { buildPeerTable } from "../../app/sentinel/lib/engine";
import { basisNote, trendBlock } from "../../app/sentinel/lib/narrativeContext";
import { buildSeedCompany, type SeedEntry } from "../../app/sentinel/lib/referenceSeed";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import type { FinancialStatement, Workspace } from "../../app/sentinel/lib/types";

const refDir = join(process.cwd(), "data", "reference-universe");
const manifest = JSON.parse(readFileSync(join(refDir, "manifest.json"), "utf-8")) as SeedEntry[];
const peers = manifest.filter((e) => e.company_name !== "TCS").map((e) => buildSeedCompany(e, readFileSync(join(refDir, e.csv), "utf-8")));
const tcs = buildSeedCompany(
  { company_name: "TCS", sector: "technology", industry: "IT services", unit: "INR_CRORE", basis: "standalone", csv: "tcs-standalone-fy26-fy25.csv", source: "TCS Integrated Annual Report 2025-26, standalone pp. 252-257." },
  readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "tcs-standalone-fy26-fy25.csv"), "utf-8")
);

const A = randomUUID();
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

test("the TCS standalone figures read from the filing give 94.46 and 88.17 receivable days and a +10.2% vs +2.8% gap", () => {
  const table = buildPeerTable(workspaces, statements, subject.id, "FY");
  const row = table.find((r) => r.workspace_id === subject.id)!;
  assert.equal(row.basis, "standalone");
  assert.ok(Math.abs((row.ratios["receivable_days"] as number) - 94.46) < 0.01);
  const fy25 = statements.find((s) => s.workspace_id === subject.id && s.period_label === "FY25")!;
  assert.ok(Math.abs((fy25.trade_receivables! / fy25.revenue_from_operations) * 365 - 88.17) < 0.01);
});

const infosys = buildSeedCompany(
  { company_name: "Infosys", sector: "technology", industry: "IT services", unit: "INR_CRORE", basis: "standalone", csv: "infosys-standalone-fy26-fy25-incl-unbilled.csv", source: "Infosys Annual Report 2025-26, standalone; trade receivables 30,337 + unbilled 13,706." },
  readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "infosys-standalone-fy26-fy25-incl-unbilled.csv"), "utf-8")
);

test("on one definition (billed + unbilled) and a 105-day ceiling none of the five IT-services companies flags; Infosys at 108.02 is the closest, inside the 3% margin", () => {
  const infWs = wsOf(infosys.entry, A);
  const infStatements = infosys.rows.map((r) => ({ ...r, id: randomUUID(), workspace_id: infWs.id, review_cycle_id: null }) as unknown as FinancialStatement);
  const table = buildPeerTable([...workspaces, infWs], [...statements, ...infStatements], subject.id, "FY");
  const days = Object.fromEntries(table.map((r) => [r.company_name, r.ratios["receivable_days"] as number]));
  assert.ok(Math.abs(days.TCS - 94.46) < 0.01 && Math.abs(days.Infosys - 108.02) < 0.01 && Math.abs(days.HCLTech - 90.14) < 0.01);
  assert.equal(Math.max(...Object.values(days)), days.Infosys);
  const flags = runAllChecks(table, "technology");
  assert.deepEqual(flags.filter((f) => f.metric === "receivable_days"), []);
});

test("the trend and basis evidence built from the real TCS figures: 88.17 -> 94.46 days, +10.16% vs +2.83%, and each peer's basis", () => {
  const fy26 = statements.find((s) => s.workspace_id === subject.id && s.period_label === "FY26")!;
  const fy25 = statements.find((s) => s.workspace_id === subject.id && s.period_label === "FY25")!;
  const trend = trendBlock(fy26, fy25, null, "technology", ["receivable_days"]);
  assert.match(trend, /receivable_days: 88\.17 in FY25 -> 94\.46 in FY26/);
  assert.match(trend, /Trade receivables \+10\.16% against revenue \+2\.83% year on year \(receivables ahead of revenue by 7\.33 points\)/);
  const note = basisNote(buildPeerTable(workspaces, statements, subject.id, "FY"))!;
  assert.match(note, /TCS \(standalone\)/);
  assert.match(note, /Wipro \(consolidated\)/);
});
