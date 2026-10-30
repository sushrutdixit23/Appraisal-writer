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

async function filingsAndDiscussionMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid);
  create table sentinel_investigations (id uuid primary key default gen_random_uuid(), workspace_id uuid, period_label text);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261107000000_sentinel_filings_and_discussion.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`); // Supabase grants new public tables by default; RLS must be what closes them
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const inv = (await db.query(`insert into sentinel_investigations (workspace_id, period_label) values ('${ws}','FY26') returning id`)).rows[0].id;

// one row per announcement, however many times the watcher sees it
const filing = `insert into sentinel_filings (workspace_id, external_id, kind, headline, filed_at) values ('${ws}','n1','results','Financial Results','2026-10-09T17:05:11')`;
await db.query(filing);
await assert.rejects(db.query(filing), /duplicate key/);
await assert.rejects(db.query(`insert into sentinel_filings (workspace_id, external_id, kind, headline, filed_at) values ('${ws}','n2','dividend','x','2026-10-09')`), /check constraint/);
assert.equal((await db.query(`select status from sentinel_filings`)).rows[0].status, "new");

// comments: only the two author kinds; a review link needs an expiry and a unique token hash
await db.query(`insert into sentinel_comments (investigation_id, workspace_id, author_kind, author_label, body) values ('${inv}','${ws}','reviewer','CA Rao','Please check unbilled revenue.')`);
await assert.rejects(db.query(`insert into sentinel_comments (investigation_id, workspace_id, author_kind, author_label, body) values ('${inv}','${ws}','stranger','x','y')`), /check constraint/);
const link = `insert into sentinel_review_links (investigation_id, workspace_id, owner_id, token_hash, expires_at) values ('${inv}','${ws}','${U1}','h1', now() + interval '7 days')`;
await db.query(link);
await assert.rejects(db.query(link), /duplicate key/);

// closed to a signed-in browser: RLS is on and no policy exists, so a direct read sees nothing
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
for (const t of ["sentinel_filings", "sentinel_review_links", "sentinel_comments"]) {
  assert.equal((await db.query(`select * from ${t}`)).rows.length, 0, `${t} is closed to browser reads`);
}
await assert.rejects(db.query(`insert into sentinel_comments (investigation_id, workspace_id, author_kind, author_label, body) values ('${inv}','${ws}','owner','me','x')`), /row-level security/);
await db.exec(`reset role`);

// deleting the investigation takes its thread and links with it
await db.query(`delete from sentinel_investigations where id = '${inv}'`);
assert.equal((await db.query(`select count(*)::int as n from sentinel_comments`)).rows[0].n, 0);
assert.equal((await db.query(`select count(*)::int as n from sentinel_review_links`)).rows[0].n, 0);
console.log("ok  filings and discussion migration");
}

async function estimatesMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261108000000_sentinel_estimates.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const ins = (metric, source, value = 1080, end = "2026-09-30") =>
  `insert into sentinel_estimates (workspace_id, owner_id, period_end_date, metric, source, value_cr) values ('${ws}','${U1}','${end}','${metric}','${source}',${value})`;
await db.query(ins("revenue", "consensus"));
await assert.rejects(db.query(ins("revenue", "consensus")), /duplicate key/, "one estimate per company, person, quarter, line and source");
await db.query(ins("revenue", "own")); // a different source is a different estimate
await db.query(ins("revenue", "consensus", 1100, "2026-12-31")); // so is a different quarter
await assert.rejects(db.query(ins("eps", "own")), /check constraint/);
await assert.rejects(db.query(ins("pat", "rumour")), /check constraint/);
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
assert.equal((await db.query(`select * from sentinel_estimates`)).rows.length, 0, "closed to browser reads");
await assert.rejects(db.query(ins("pat", "own")), /row-level security/);
await db.exec(`reset role`);
await db.query(`delete from sentinel_workspaces where id = '${ws}'`);
assert.equal((await db.query(`select count(*)::int as n from sentinel_estimates`)).rows[0].n, 0, "deleting the company takes its estimates");
console.log("ok  estimates migration");
}

async function transcriptsMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261109000000_sentinel_transcripts.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const ins = (end = "2026-09-30") => `insert into sentinel_transcripts (workspace_id, owner_id, period_end_date, items) values ('${ws}','${U1}','${end}','[{"topic":"outlook"}]'::jsonb)`;
await db.query(ins());
await assert.rejects(db.query(ins()), /duplicate key/, "one reading per company, person and quarter");
await db.query(ins("2026-06-30"));
assert.deepEqual((await db.query(`select items from sentinel_transcripts limit 1`)).rows[0].items, [{ topic: "outlook" }]);
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
assert.equal((await db.query(`select * from sentinel_transcripts`)).rows.length, 0, "closed to browser reads");
await assert.rejects(db.query(ins("2026-03-31")), /row-level security/);
await db.exec(`reset role`);
await db.query(`delete from sentinel_workspaces where id = '${ws}'`);
assert.equal((await db.query(`select count(*)::int as n from sentinel_transcripts`)).rows[0].n, 0);
console.log("ok  transcripts migration");
}

async function annualChecksMigration() {
const db = new PGlite();
await db.exec(`create table sentinel_statements (id uuid primary key default gen_random_uuid(), period_label text, key_audit_matters_text text);`);
const sql = fs.readFileSync(root + "20261110000000_sentinel_annual_report_checks.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.query(`insert into sentinel_statements (period_label, annual_report_checks) values ('FY26', '{"o":"unmodified","f":[]}')`);
assert.equal((await db.query(`select annual_report_checks from sentinel_statements`)).rows[0].annual_report_checks, '{"o":"unmodified","f":[]}');
console.log("ok  annual-report checks migration");
}

async function holdingsMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261113000000_sentinel_holdings.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const ins = (owner, qty, cost = "null") => `insert into sentinel_holdings (owner_id, workspace_id, quantity, avg_cost) values ('${owner}','${ws}',${qty},${cost})`;
await db.query(ins(U1, 10, 250));
await db.query(ins(U2, 5)); // another person may hold the same company
await assert.rejects(db.query(ins(U1, 20)), /unique/); // one row per person and company
await assert.rejects(db.query(ins(U2, 0).replace(U2, "33333333-3333-3333-3333-333333333333")), /check constraint/);
await assert.rejects(db.query(ins("33333333-3333-3333-3333-333333333333", 1, -5)), /check constraint/);
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
assert.equal((await db.query(`select * from sentinel_holdings`)).rows.length, 0, "closed to browser reads");
await assert.rejects(db.query(ins("44444444-4444-4444-4444-444444444444", 1)), /row-level security/);
await db.exec(`reset role`);
await db.query(`delete from sentinel_workspaces where id = '${ws}'`);
assert.equal((await db.query(`select count(*)::int as n from sentinel_holdings`)).rows[0].n, 0, "deleting the company takes its holdings");
console.log("ok  holdings migration");
}

async function covenantsMigration() {
const db = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated;
  create table sentinel_workspaces (id uuid primary key default gen_random_uuid(), owner_id uuid);
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to authenticated;
`);
const sql = fs.readFileSync(root + "20261111000000_sentinel_covenants.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
const ws = (await db.query(`insert into sentinel_workspaces (owner_id) values ('${U1}') returning id`)).rows[0].id;
const ins = (metric, comparator, limit = 3) =>
  `insert into sentinel_covenants (workspace_id, owner_id, name, metric, comparator, limit_value) values ('${ws}','${U1}','Term loan','${metric}','${comparator}',${limit})`;
await db.query(ins("net_debt_ebitda", "max"));
await db.query(ins("net_debt_ebitda", "max")); // two covenants on the same ratio are allowed (different facilities)
await assert.rejects(db.query(ins("pe_ratio", "max")), /check constraint/);
await assert.rejects(db.query(ins("interest_cover", "exactly")), /check constraint/);
await assert.rejects(db.query(ins("interest_cover", "min", 0)), /check constraint/);
await db.exec(`set role authenticated`);
await db.exec(`set test.uid = '${U1}'`);
assert.equal((await db.query(`select * from sentinel_covenants`)).rows.length, 0, "closed to browser reads");
await assert.rejects(db.query(ins("current_ratio", "min")), /row-level security/);
await db.exec(`reset role`);
await db.query(`delete from sentinel_workspaces where id = '${ws}'`);
assert.equal((await db.query(`select count(*)::int as n from sentinel_covenants`)).rows[0].n, 0, "deleting the company takes its covenants");
console.log("ok  covenants migration");
}

async function annualNotesMigration() {
const db = new PGlite();
await db.exec(`create table sentinel_statements (id uuid primary key default gen_random_uuid(), period_label text);`);
const sql = fs.readFileSync(root + "20261112000000_sentinel_annual_report_notes.sql", "utf8");
await db.exec(sql);
await db.exec(sql); // idempotent
await db.query(`insert into sentinel_statements (period_label, annual_report_notes) values ('FY26', '{"v":1,"f":[]}')`);
assert.equal((await db.query(`select annual_report_notes from sentinel_statements`)).rows[0].annual_report_notes, '{"v":1,"f":[]}');
console.log("ok  annual-report notes migration");
}

await auditMigration();
await otherMigrations();
await filingsAndDiscussionMigration();
await estimatesMigration();
await transcriptsMigration();
await annualChecksMigration();
await covenantsMigration();
await annualNotesMigration();
await holdingsMigration();
