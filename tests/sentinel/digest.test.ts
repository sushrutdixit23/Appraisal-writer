// The coverage digest: what lands on the list, in what order, and what never does.

import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../app/sentinel/lib/digest";
import type { Investigation, Recommendation } from "../../app/sentinel/lib/types";
import { st, ws } from "./helpers";

const ME = "me";
const mine = (id: string, over = {}) => ws(id, { sector: "technology", owner_id: ME, is_public_reference: false, ...over });
const inv = (over: Partial<Investigation>): Investigation => ({ id: "i", workspace_id: "a", period_label: "FY26", status: "pending", observation: [], confidence_score: 50, ...over } as Investigation);
const rec = (over: Partial<Recommendation>): Recommendation => ({ id: "r", workspace_id: "a", status: "pending", priority: "Low", title: "t", owner: "CFO", timeline: "soon", business_value: "v", ...over } as Recommendation);
const base = { userId: ME, today: "2026-10-28", statements: [], recommendations: [], investigations: [] };
const section = (d: ReturnType<typeof buildDigest>, id: string) => d.sections.find((s) => s.id === id)!;

test("pending drafts are listed most confident first; decided and other people's drafts are not", () => {
  const d = buildDigest({
    ...base, workspaces: [mine("a"), mine("b"), ws("ref", { sector: "technology", owner_id: null })],
    investigations: [inv({ id: "1", workspace_id: "a", confidence_score: 60 }), inv({ id: "2", workspace_id: "b", confidence_score: 85 }), inv({ id: "3", workspace_id: "a", status: "rejected", period_label: "FY25" }), inv({ id: "4", workspace_id: "ref", confidence_score: 99 })],
  });
  assert.deepEqual(section(d, "decide").items.map((i) => i.company_name), ["B", "A"]);
});

test("an untraced figure in a draft is called out in its line", () => {
  const d = buildDigest({ ...base, workspaces: [mine("a")], investigations: [inv({ grounding_warnings: ["x", "y"] })] });
  assert.match(section(d, "decide").items[0].detail, /2 figures in the narrative could not be traced/);
});

test("a flagged company with no investigation shows up; once investigated it does not; a reference company never does", () => {
  const statements = [
    st("a", { period_label: "FY26", period_end_date: "2026-03-31", revenue_from_operations: 150 }), st("a", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 100 }),
    st("ref", { period_label: "FY26", period_end_date: "2026-03-31", revenue_from_operations: 150 }), st("ref", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 100 }),
  ];
  const workspaces = [mine("a"), ws("ref", { sector: "technology", owner_id: null, is_public_reference: true })];
  const open = buildDigest({ ...base, workspaces, statements });
  assert.deepEqual(section(open, "investigate").items.map((i) => i.company_name), ["A"]);
  const done = buildDigest({ ...base, workspaces, statements, investigations: [inv({ status: "approved" })] });
  assert.equal(section(done, "investigate").items.length, 0);
});

test("recommendations come High before Low, and only pending ones", () => {
  const d = buildDigest({ ...base, workspaces: [mine("a")], recommendations: [rec({ id: "1", priority: "Low", title: "low one" }), rec({ id: "2", priority: "High", title: "high one" }), rec({ id: "3", status: "approved", priority: "High", title: "done" })] });
  assert.deepEqual(section(d, "recommendations").items.map((i) => i.title), ["High: high one", "Low: low one"]);
});

test("overdue data requests are listed; open-and-on-time and submitted ones are not", () => {
  const d = buildDigest({
    ...base, workspaces: [mine("a")],
    requests: [
      { workspace_id: "a", period_end_date: "2026-03-31", due_date: "2026-04-15", status: "open" },
      { workspace_id: "a", period_end_date: "2026-09-30", due_date: "2026-11-15", status: "open" },
      { workspace_id: "a", period_end_date: "2026-06-30", due_date: "2026-07-15", status: "submitted" },
    ],
  });
  assert.equal(section(d, "requests").items.length, 1);
  assert.match(section(d, "requests").items[0].title, /2026-03-31 not received/);
});

test("stale inputs: a missing year, no price, an old price - and a current one is left alone", () => {
  const withShares = (id: string, end: string) => st(id, { period_label: "FY", period_end_date: end, shares_outstanding: 1000 });
  const d = buildDigest({
    ...base, workspaces: [mine("old"), mine("noprice"), mine("stale", { market_price: 10, market_price_as_of: "2026-10-10" }), mine("fresh", { market_price: 10, market_price_as_of: "2026-10-27" }), mine("empty")],
    statements: [withShares("old", "2025-03-31"), withShares("noprice", "2026-03-31"), withShares("stale", "2026-03-31"), withShares("fresh", "2026-03-31")],
  });
  const titles = section(d, "data").items.map((i) => i.title).join(" | ");
  assert.match(titles, /OLD - the year to 2026-03-31 is not on file/);
  assert.match(titles, /NOPRICE - no share price/);
  assert.match(titles, /STALE - share price is 18 days old/);
  assert.match(titles, /EMPTY - no annual statements/);
  assert.ok(!/FRESH/.test(titles));
  assert.equal(d.total, section(d, "data").items.length);
});

test("new filings lead the digest, newest first, own companies only, with the BSE link", () => {
  const d = buildDigest({
    ...base, workspaces: [mine("a"), mine("b"), ws("ref", { sector: "technology", owner_id: null })],
    filings: [
      { id: "1", workspace_id: "a", kind: "results", headline: "Financial Results Q2", filed_at: "2026-10-09T17:05:11", url: "https://www.bseindia.com/x" },
      { id: "2", workspace_id: "b", kind: "annual_report", headline: "Annual Report FY26", filed_at: "2026-10-20T09:00:00", url: null },
      { id: "3", workspace_id: "ref", kind: "results", headline: "not mine", filed_at: "2026-10-27T09:00:00", url: null },
    ],
  });
  assert.equal(d.sections[0].id, "filings");
  assert.deepEqual(section(d, "filings").items.map((i) => i.title), ["B - annual report filed 2026-10-20", "A - results filed 2026-10-09"]);
  assert.match(section(d, "filings").items[1].detail, /Open on BSE: https:\/\/www\.bseindia\.com\/x/);
  assert.equal(section(d, "filings").items[0].href, "/sentinel/projects/b/import");
});

test("unread reviewer comments are listed with a count; read ones and other people's are not", () => {
  const d = buildDigest({
    ...base, workspaces: [mine("a"), mine("b"), ws("x", { owner_id: "other" })],
    discussion: [{ workspace_id: "a", period_label: "FY26", unread: 2 }, { workspace_id: "b", period_label: "FY26", unread: 0 }, { workspace_id: "x", period_label: "FY26", unread: 5 }],
  });
  assert.deepEqual(section(d, "discussion").items.map((i) => i.title), ["A - 2 new comments on FY26"]);
});
