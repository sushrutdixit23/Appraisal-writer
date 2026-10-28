// The shipped reference peer set: every company must pass the app's own validation, and the SQL must be idempotent.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeedCompany, seedSql, type SeedEntry } from "../../app/sentinel/lib/referenceSeed";

const dir = join(process.cwd(), "data", "reference-universe");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as SeedEntry[];
const companies = manifest.map((e) => buildSeedCompany(e, readFileSync(join(dir, e.csv), "utf-8")));

test("every seeded company reads and validates, two periods each, and each balance sheet balances", () => {
  assert.equal(companies.length, 4);
  for (const c of companies) {
    assert.equal(c.rows.length, 2, c.entry.company_name);
    for (const r of c.rows) {
      assert.equal((r.total_equity as number) + (r.total_liabilities as number), r.total_assets, `${c.entry.company_name} ${r.period_label}`);
      assert.equal(r.basis, "consolidated");
    }
  }
});

test("the seed SQL never overwrites: a company present under the same name and an existing period are both skipped", () => {
  const sql = seedSql(companies);
  assert.equal((sql.match(/where not exists \(select 1 from sentinel_workspaces where lower\(company_name\)/g) ?? []).length, 4);
  assert.equal((sql.match(/on conflict do nothing;/g) ?? []).length, 8);
  assert.ok(!/\bupdate\b|\bdelete\b|\btruncate\b|\bdrop\b/i.test(sql.replace(/--.*$/gm, "")), "the seed must only insert");
  assert.match(sql, /'INR_MILLION'/);
});

test("a figure that fails validation stops the seed instead of being shipped", () => {
  const bad = readFileSync(join(dir, "wipro-consolidated.csv"), "utf-8").replace("1414077", "1");
  assert.throws(() => buildSeedCompany(manifest.find((e) => e.company_name === "Wipro")!, bad), /Wipro FY26/);
});
