// Discussion on an investigation and the filing watcher's routes: who may share and read what, what a review link shows
// and hides, what a revoked or expired link does, and the limits on a public comment.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DELETE as REVOKE, GET as LINKS, POST as MAKE_LINK } from "../../app/api/sentinel/review-links/route";
import { GET as THREAD, PATCH as READ, POST as COMMENT } from "../../app/api/sentinel/comments/route";
import { GET as VIEW, POST as REVIEWER_COMMENT } from "../../app/api/sentinel/review/[token]/route";
import { GET as FILINGS, PATCH as DISMISS, POST as CHECK } from "../../app/api/sentinel/filings/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { hashToken } from "../../app/sentinel/lib/requests";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
let ws = "", inv = "";

before(async () => { await backend.start(); useBackend(backend); backend.addUser("tok-a", A); backend.addUser("tok-b", B); });
after(() => backend.stop());
beforeEach(() => {
  resetRateLimits();
  backend.tables = {};
  ws = randomUUID(); inv = randomUUID();
  backend.tables.sentinel_workspaces = [{ id: ws, owner_id: A, company_name: "Acme Services", is_public_reference: false, sector: "technology", currency_unit: "INR_CRORE", comparison_basis: "standalone", fiscal_year_start_month: 4, currency: "INR" }];
  backend.tables.sentinel_investigations = [{
    id: inv, workspace_id: ws, owner_id: A, period_label: "FY26", status: "pending", confidence_score: 49,
    ai_narrative: "**Points to something else**\n\nReceivable days rose.", final_narrative: null, initial_hypothesis: "PRIVATE HYPOTHESIS",
    reviewer_notes: "PRIVATE NOTE", observation: [{ metric: "receivable_days", description: "receivable days of 94 exceed 90", value: 94, threshold: 90, severity: 1.04 }],
    suggested_questions: ["How much is unbilled?"], grounding_warnings: ["x"], generation_usage: { cost: 1 },
  }];
});

const req = (token: string | null, method: string, body?: unknown, url = "http://localhost/api/x") =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
async function share(token: string | null = "tok-a", extra: Record<string, unknown> = {}) {
  const res = await MAKE_LINK(req(token, "POST", { investigation_id: inv, ...extra }));
  return { status: res.status, json: (await res.json()) as any };
}
const view = async (t: string) => { const r = await VIEW(req(null, "GET"), ctx(t)); return { status: r.status, json: (await r.json()) as any }; };
const say = async (t: string, body: unknown) => { const r = await REVIEWER_COMMENT(req(null, "POST", body), ctx(t)); return { status: r.status, json: (await r.json()) as any }; };

test("only the investigation's owner can share it; the link is returned once and only its hash is stored", async () => {
  assert.equal((await share("tok-b")).status, 404);
  assert.equal((await share(null)).status, 401);
  const r = await share("tok-a", { label: "CA Rao", days: 7 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.review_path, /^\/sentinel-review\/[A-Za-z0-9_-]{32}$/);
  const [row] = backend.rowsOf("sentinel_review_links");
  assert.equal(row.token_hash, hashToken(r.json.token));
  assert.ok(!JSON.stringify(row).includes(r.json.token), "the plain token is nowhere in the stored row");
  assert.equal(r.json.days, 7);
  const list = await (await LINKS(req("tok-a", "GET", undefined, `http://localhost/api/x?investigation_id=${inv}`))).json() as any;
  assert.equal(list.links[0].state, "active");
  assert.ok(!("token_hash" in list.links[0]));
});

test("a review link shows the finding and nothing else: no private notes, hypothesis, cost or other tables", async () => {
  const { json: made } = await share();
  const r = await view(made.token);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.investigation).sort(), ["company_name", "confidence_score", "flags", "narrative", "period_label", "questions", "status", "untraced_figures"]);
  assert.equal(r.json.investigation.company_name, "Acme Services");
  assert.match(r.json.investigation.narrative, /Receivable days rose/);
  const everything = JSON.stringify(r.json);
  assert.ok(!/PRIVATE|generation_usage|owner_id|token_hash/.test(everything), everything);
});

test("a malformed, unknown, revoked or expired link all say the same thing", async () => {
  const { json: made } = await share();
  const unknown = await view("a".repeat(32));
  const malformed = await view("short");
  assert.deepEqual([unknown.status, malformed.status], [404, 404]);
  assert.equal(unknown.json.error, malformed.json.error);
  // revoke
  const id = backend.rowsOf("sentinel_review_links")[0].id as string;
  assert.equal((await REVOKE(req("tok-b", "DELETE", undefined, `http://localhost/api/x?id=${id}`))).status, 404, "another person cannot revoke it");
  assert.equal((await REVOKE(req("tok-a", "DELETE", undefined, `http://localhost/api/x?id=${id}`))).status, 200);
  const revoked = await view(made.token);
  assert.equal(revoked.status, 404);
  assert.equal(revoked.json.error, unknown.json.error);
  assert.equal((await say(made.token, { body: "hi" })).status, 404);
  // expire
  const { json: second } = await share();
  backend.rowsOf("sentinel_review_links").find((l) => l.token_hash === hashToken(second.token))!.expires_at = "2020-01-01T00:00:00.000Z";
  assert.equal((await view(second.token)).status, 404);
});

test("a reviewer's comment lands in the owner's thread as unread; the owner reads it, replies, and the reviewer sees the reply", async () => {
  const { json: made } = await share("tok-a", { label: "CA Rao" });
  const c = await say(made.token, { name: "  Rao & Co  ", body: "Please check the unbilled revenue." });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.comment.author_label, "Rao & Co");
  assert.deepEqual(backend.rowsOf("sentinel_comments")[0].author_kind, "reviewer");

  const summary = await (await THREAD(req("tok-a", "GET", undefined, `http://localhost/api/x?summary=1&workspace_id=${ws}`))).json() as any;
  assert.deepEqual(summary.unread, [{ period_label: "FY26", unread: 1 }]);
  const thread = await (await THREAD(req("tok-a", "GET", undefined, `http://localhost/api/x?investigation_id=${inv}`))).json() as any;
  assert.equal(thread.comments[0].read, false);

  assert.equal((await READ(req("tok-a", "PATCH", { investigation_id: inv }))).status, 200);
  const after = await (await THREAD(req("tok-a", "GET", undefined, `http://localhost/api/x?summary=1&workspace_id=${ws}`))).json() as any;
  assert.deepEqual(after.unread, []);

  const reply = await COMMENT(req("tok-a", "POST", { investigation_id: inv, body: "Unbilled is 80 cr." }));
  assert.equal(reply.status, 201);
  const seen = await view(made.token);
  assert.deepEqual(seen.json.comments.map((x: any) => [x.author_kind, x.body]), [["reviewer", "Please check the unbilled revenue."], ["owner", "Unbilled is 80 cr."]]);
  assert.ok(!("read" in seen.json.comments[0]) && !("investigation_id" in seen.json.comments[0]));
});

test("another person cannot read, comment on or mark read someone else's thread", async () => {
  await share();
  const q = `http://localhost/api/x?investigation_id=${inv}`;
  assert.equal((await THREAD(req("tok-b", "GET", undefined, q))).status, 404);
  assert.equal((await COMMENT(req("tok-b", "POST", { investigation_id: inv, body: "hi" }))).status, 404);
  assert.equal((await READ(req("tok-b", "PATCH", { investigation_id: inv }))).status, 404);
  assert.equal((await THREAD(req("tok-b", "GET", undefined, `http://localhost/api/x?summary=1&workspace_id=${ws}`))).status, 404);
  assert.equal((await COMMENT(req(null, "POST", { investigation_id: inv, body: "hi" }))).status, 401);
});

test("limits: empty and over-long comments are refused, a flooded thread is closed, and a link cannot post more than ten comments in ten minutes", async () => {
  const { json: made } = await share();
  assert.equal((await say(made.token, { body: "   " })).status, 400);
  const long = await say(made.token, { body: "x".repeat(2001) });
  assert.equal(long.status, 400);
  assert.match(long.json.error, /limited to 2000 characters/);
  assert.equal(backend.rowsOf("sentinel_comments").length, 0, "a refused comment is not stored");
  assert.equal((await say(made.token, { name: "\u0007\n", body: "ok" })).json.comment.author_label, "Reviewer");
  for (let i = 0; i < 6; i++) await say(made.token, { body: `c${i}` }); // 3 refused or odd attempts above + 6 = 9 so far (refused attempts count against the limit)
  assert.equal((await say(made.token, { body: "tenth" })).status, 201);
  assert.equal((await say(made.token, { body: "eleventh" })).status, 429);

  resetRateLimits();
  for (let i = 0; i < 300; i++) backend.tables.sentinel_comments.push({ id: randomUUID(), investigation_id: inv, workspace_id: ws, author_kind: "owner", author_label: "Analyst", body: "x", read_at: null, created_at: new Date().toISOString() });
  assert.equal((await say(made.token, { body: "one more" })).status, 429);
});

test("a database without the discussion tables says how to set it up instead of failing", async () => {
  backend.failNext = { table: "sentinel_review_links", method: "POST", status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.sentinel_review_links' in the schema cache" } };
  const r = await share();
  assert.equal(r.status, 501);
  assert.match(r.json.error, /20261107000000/);
});

// ---- filings routes ------------------------------------------------------------------------------------------------

test("filings: the owner lists new ones and dismisses one; another person can do neither; no scrip code is a plain 400", async () => {
  backend.tables.sentinel_filings = [
    { id: randomUUID(), workspace_id: ws, source: "bse", external_id: "n1", kind: "results", headline: "Financial Results", filed_at: "2026-10-09T17:05:11", url: "https://www.bseindia.com/x", status: "new" },
  ];
  const fid = backend.rowsOf("sentinel_filings")[0].id as string;
  const q = `http://localhost/api/x?workspace_id=${ws}`;
  const mine = await (await FILINGS(req("tok-a", "GET", undefined, q))).json() as any;
  assert.deepEqual(mine.filings.map((f: any) => f.headline), ["Financial Results"]);
  assert.equal((await FILINGS(req("tok-b", "GET", undefined, q))).status, 404);
  assert.equal((await DISMISS(req("tok-b", "PATCH", { workspace_id: ws, id: fid }))).status, 404);
  assert.equal(backend.rowsOf("sentinel_filings")[0].status, "new");
  assert.equal((await DISMISS(req("tok-a", "PATCH", { workspace_id: ws, id: fid }))).status, 200);
  assert.equal(backend.rowsOf("sentinel_filings")[0].status, "dismissed");
  const after = await (await FILINGS(req("tok-a", "GET", undefined, q))).json() as any;
  assert.deepEqual(after.filings, []);
  const check = await CHECK(req("tok-a", "POST", { workspace_id: ws }));
  assert.equal(check.status, 400);
  assert.match(((await check.json()) as any).error, /no BSE scrip code/);
});
