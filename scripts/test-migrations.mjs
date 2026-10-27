// Runs the Supabase migrations in supabase/migrations against an embedded Postgres (PGlite) with a stand-in for
// Supabase's auth.uid(), and checks what they promise: safe to run twice, the audit trigger records a signed-in
// browser's writes (and not server writes), row-level security lets the right people read and write, and the added
// columns work with the trigger. It does not replace trying them on a copy of the real database.
//
//   npm run test:migrations
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations") + path.sep;

async function auditMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid, is_public_reference boolean default false);
  create table sentinel_statements (id uuid primary key default gen_random_uuid(), workspace_id uuid, period_label text, basis text, revenue_from_operations numeric, profit_after_tax numeric, updated_at timestamptz default now());
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261028000000_sentinel_audit.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on sentinel_statement_changes, sentinel_field_sources to authenticated`); // Supabase grants new public tables by default; RLS must be what blocks writes
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const rows = async () => (await db.query(`select action, changed_by, via, changes from sentinel_statement_changes order by changed_at, id`)).rows;

// server-route style write: no person -> trigger records nothing
await db.exec(`set test.uid = ''`);
await db.query(`insert into sentinel_statements (workspace_id, period_label, basis, revenue_from_operations, profit_after_tax) values ('${ws}', 'FY25', 'consolidated', 100, 10)`);
assert.equal((await rows()).length, 0, "service-role write must not be recorded by the trigger");

// browser write by a person
await db.exec(`set test.uid = '${U1}'`);
const id = (await db.query(`insert into sentinel_statements (workspace_id, period_label, basis, revenue_from_operations, profit_after_tax) values ('${ws}', 'FY26', 'consolidated', 200, 20) returning id`)).rows[0].id;
await db.query(`update sentinel_statements set revenue_from_operations = 250, profit_after_tax = 20 where id = '${id}'`);
await db.query(`update sentinel_statements set profit_after_tax = 20 where id = '${id}'`); // no real change
await db.query(`delete from sentinel_statements where id = '${id}'`);
const r = await rows();
assert.deepEqual(r.map((x) => x.action), ["created", "updated", "deleted"]);
assert.ok(r.every((x) => x.via === "browser" && x.changed_by === U1));
assert.deepEqual(r[1].changes, { revenue_from_operations: { old: 200, new: 250 } }, "only the changed field, and not updated_at");
assert.equal(r[2].changes.deleted_row.period_label, "FY26", "a deleted row is kept");

// RLS: owner reads their history, another person reads none, nobody writes from the browser
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
assert.equal((await db.query(`select * from sentinel_statement_changes`)).rows.length, 3);
await db.exec(`set test.uid = '${U2}'`);
assert.equal((await db.query(`select * from sentinel_statement_changes`)).rows.length, 0);
await assert.rejects(db.query(`insert into sentinel_statement_changes (workspace_id, action, via) values ('${ws}', 'created', 'api')`));
await db.exec(`reset role`);
console.log("ok  audit migration");

}

async function otherMigrations() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid, is_public_reference boolean default false);
  create table sentinel_statements (id uuid primary key default gen_random_uuid(), workspace_id uuid, period_label text, basis text, revenue_from_operations numeric);
  grant usage on schema auth to authenticated;
`);
for (const f of ["20261028000000_sentinel_audit.sql", "20261029000000_sentinel_score_fields.sql", "20261030000000_sentinel_operating_metrics.sql"]) {
  const sql = fs.readFileSync(root + f, "utf8");
  await db.exec(sql); await db.exec(sql);
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
const cols = (await db.query(`select column_name from information_schema.columns where table_name='sentinel_statements'`)).rows.map((r) => r.column_name);
for (const c of ["retained_earnings", "cost_of_goods_sold", "sga_expense"]) assert.ok(cols.includes(c), c);

const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const pub = (await db.query(`insert into sentinel_workspaces (owner_id, is_public_reference) values (null, true) returning id`)).rows[0].id;
await db.exec(`set test.uid = '${U1}'`);
// the audit trigger picks up the new columns without any change
const sid = (await db.query(`insert into sentinel_statements (workspace_id, period_label, basis) values ('${ws}','FY26','consolidated') returning id`)).rows[0].id;
await db.query(`update sentinel_statements set retained_earnings = 500 where id='${sid}'`);
const ch = (await db.query(`select changes from sentinel_statement_changes where action='updated'`)).rows;
assert.deepEqual(ch[0].changes, { retained_earnings: { old: null, new: 500 } });

// metrics RLS: owner writes and reads; other person reads nothing of it, writes nothing; reference readable by all
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
await db.query(`insert into sentinel_operating_metrics (workspace_id, period_label, metric, value, unit) values ('${ws}','Q3 FY26','attrition_pct', 13.5, '%')`);
await assert.rejects(db.query(`insert into sentinel_operating_metrics (workspace_id, period_label, metric, value) values ('${ws}','Q3 FY26','attrition_pct', 1)`), /duplicate key/);
await db.exec(`reset role`);
await db.query(`insert into sentinel_operating_metrics (workspace_id, period_label, metric, value) values ('${pub}','Q3 FY26','headcount', 300000)`);
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U2}'`);
const seen = (await db.query(`select workspace_id from sentinel_operating_metrics`)).rows.map((r) => r.workspace_id);
assert.deepEqual(seen, [pub], "another person sees only the reference company's metrics");
await assert.rejects(db.query(`insert into sentinel_operating_metrics (workspace_id, period_label, metric, value) values ('${ws}','FY26','x',1)`), /row-level security/);
await assert.rejects(db.query(`insert into sentinel_operating_metrics (workspace_id, period_label, metric, value) values ('${pub}','FY26','x',1)`), /row-level security/);
console.log("ok  score-fields and operating-metrics migrations");

}

await auditMigration();
await otherMigrations();
