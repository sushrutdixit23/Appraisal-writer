// Builds supabase/seed/reference-universe.sql from data/reference-universe/manifest.json and its CSVs. Every CSV is
// read and validated by the app's own rules first; one bad figure stops the whole run with the reason.
//
//   npm run seed:reference
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeedCompany, seedSql, type SeedEntry } from "../app/sentinel/lib/referenceSeed";

const dir = join(process.cwd(), "data", "reference-universe");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as SeedEntry[];
const companies = manifest.map((e) => buildSeedCompany(e, readFileSync(join(dir, e.csv), "utf-8")));
const out = join(process.cwd(), "supabase", "seed", "reference-universe.sql");
writeFileSync(out, seedSql(companies));
console.log(`${companies.length} companies, ${companies.reduce((n, c) => n + c.rows.length, 0)} periods -> ${out}`);
