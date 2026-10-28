// The receivable-days comparison that a real draft got wrong, worked out from the two annual reports' own line items.
//
// TCS standalone (Integrated Annual Report 2025-26, standalone balance sheet): trade receivables are printed as Billed and
// Unbilled, current and non-current. FY26: billed 48,892 + 99, unbilled 8,084 + 102 = 57,177. FY25: billed 44,392 + 91,
// unbilled 7,375 + 44 = 51,902. Revenue 220,938 and 214,853.
// Infosys standalone (Annual Report 2025-26): trade receivables 30,337 / 26,413 EXCLUDE unbilled revenue, which the
// credit-risk note gives separately as 13,706 / 11,988. Revenue 148,819 and 136,592.
//
// A draft compared TCS's 94.46 (billed + unbilled) with Infosys's 74.41 (billed only), called the 20-day gap a TCS-specific
// collections problem, and said there was "no basis mismatch". On a like-for-like basis the gap does not exist.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeedCompany } from "../../app/sentinel/lib/referenceSeed";
import { near } from "./helpers";

const days = (receivables: number, revenue: number) => (receivables / revenue) * 365;

test("billed-only: TCS 80.94 against Infosys 74.41 days - a 6.5-day gap, not 20", () => {
  assert.ok(near(days(48_892 + 99, 220_938), 80.94, 0.01));
  assert.ok(near(days(30_337, 148_819), 74.41, 0.01));
});

test("billed plus unbilled: TCS 94.46 against Infosys 108.02 days - Infosys is the LONGER, by 13.6 days", () => {
  assert.ok(near(days(48_892 + 99 + 8_084 + 102, 220_938), 94.46, 0.01));
  assert.ok(near(days(30_337 + 13_706, 148_819), 108.02, 0.01));
  assert.ok(days(30_337 + 13_706, 148_819) - days(57_177, 220_938) > 13);
});

test("the Infosys file re-built on the billed-plus-unbilled definition passes the app's own validation and reads 108.02 / 102.61 days", () => {
  const csv = readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "infosys-standalone-fy26-fy25-incl-unbilled.csv"), "utf-8");
  const c = buildSeedCompany({ company_name: "Infosys", sector: "technology", industry: "IT services", unit: "INR_CRORE", basis: "standalone", csv: "x", source: "Infosys Annual Report 2025-26, standalone." }, csv);
  const by = Object.fromEntries(c.rows.map((r) => [r.period_label, r]));
  assert.ok(near(days(by.FY26.trade_receivables as number, by.FY26.revenue_from_operations as number), 108.02, 0.01));
  assert.ok(near(days(by.FY25.trade_receivables as number, by.FY25.revenue_from_operations as number), 102.61, 0.01));
  assert.equal(by.FY26.unbilled_revenue, 13_706);
});
