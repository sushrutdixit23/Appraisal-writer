// The filing watcher: the announcement classifier, the BSE reply parser (against the shape of a real sample response from
// the open-source `bse` client), the fetch's failure modes, and the store that keeps each announcement once.
// Nothing here talks to BSE.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { bseAnnouncementsUrl, classifyAnnouncement, fetchFilings, parseBseAnnouncements } from "../../app/sentinel/lib/filings";
import { watchFilings } from "../../app/sentinel/lib/filingWatch";
import { getAdmin, isFailure } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

// The field names and value shapes are those of the sample in BseIndiaApi/src/samples/announcements.json.
const row = (over: Record<string, unknown>) => ({
  NEWSID: "6fb57b5e-a05f-4e05-b2da-6e2b5bfe32ae", SCRIP_CD: 532540, NEWSSUB: "TATA CONSULTANCY SERVICES LTD. - 532540 - Announcement under Regulation 30 (LODR)-Newspaper Publication",
  DT_TM: "2026-10-09T17:05:11.37", NEWS_DT: "2026-10-09T17:05:11.37", ATTACHMENTNAME: "aab5.pdf", HEADLINE: "", CATEGORYNAME: null, SUBCATNAME: "Newspaper Publication",
  NSURL: "https://www.bseindia.com/stock-share-price/tata-consultancy-services-ltd/tcs/532540/", ...over,
});
const feed = (rows: unknown[]) => ({ Table: rows, Table1: [{ ROWCNT: rows.length }] });

test("results and annual reports are filings; notices, certificates and meeting intimations are not", () => {
  assert.equal(classifyAnnouncement("TCS - Financial Results for the quarter ended September 30, 2026"), "results");
  assert.equal(classifyAnnouncement("Outcome of Board Meeting - Unaudited Financial Results for the half year"), "results");
  assert.equal(classifyAnnouncement("Submission of Annual Report for FY 2025-26"), "annual_report");
  assert.equal(classifyAnnouncement("Reg. 39 (3) - Details of Loss of Certificate / Duplicate Certificate"), null);
  assert.equal(classifyAnnouncement("Intimation of Board Meeting to consider financial results"), null);
  assert.equal(classifyAnnouncement("Notice of the 31st Annual General Meeting"), null);
});

test("the parser keeps only filings, reads BSE's field names, and survives nulls and a broken body", () => {
  const out = parseBseAnnouncements(feed([
    row({ NEWSID: "n1", NEWSSUB: "TCS - Financial Results for the quarter ended September 30, 2026", SUBCATNAME: "Financial Results", CATEGORYNAME: null }),
    row({ NEWSID: "n2" }),
    row({ NEWSID: "n3", NEWSSUB: "TCS - Annual Report 2025-26", DT_TM: undefined, NEWS_DT: "2026-06-01T10:00:00" }),
    row({ NEWSID: undefined, NEWSSUB: "Financial Results" }),
  ]));
  assert.deepEqual(out.map((f) => [f.external_id, f.kind, f.filed_at]), [["n1", "results", "2026-10-09T17:05:11.37"], ["n3", "annual_report", "2026-06-01T10:00:00"]]);
  assert.match(out[0].url ?? "", /bseindia\.com\/stock-share-price/);
  assert.deepEqual(parseBseAnnouncements(null), []);
  assert.deepEqual(parseBseAnnouncements({ Table: "nope" }), []);
});

test("the request carries the scrip, the date window and BSE's own parameter names", () => {
  const url = bseAnnouncementsUrl("532540", new Date("2026-10-01T00:00:00Z"), new Date("2026-10-11T00:00:00Z"));
  const q = new URL(url).searchParams;
  assert.equal(new URL(url).pathname, "/BseIndiaAPI/api/AnnSubCategoryGetData/w");
  assert.deepEqual([q.get("strScrip"), q.get("strPrevDate"), q.get("strToDate"), q.get("strType"), q.get("strCat")], ["532540", "20261001", "20261011", "C", "-1"]);
});

test("a refusal, a non-JSON page, a changed format, a network error and a bad scrip code each say what happened", async () => {
  const reply = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  assert.deepEqual(await fetchFilings("532540", new Date(), 10, reply(403, "denied")), { ok: false, error: "BSE answered 403." });
  assert.match((await fetchFilings("532540", new Date(), 10, reply(200, "<html>captcha</html>")) as { error: string }).error, /did not return JSON/);
  assert.match((await fetchFilings("532540", new Date(), 10, reply(200, JSON.stringify({ rows: [] }))) as { error: string }).error, /format may have changed/);
  assert.match((await fetchFilings("532540", new Date(), 10, (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch) as { error: string }).error, /Could not reach BSE: ECONNRESET/);
  assert.match((await fetchFilings("TCS") as { error: string }).error, /not a BSE scrip code/);
  const ok = await fetchFilings("532540", new Date(), 10, reply(200, JSON.stringify(feed([row({ NEWSID: "n1", NEWSSUB: "Financial Results" })]))));
  assert.equal(ok.ok && ok.filings.length, 1);
});

// ---- the store ---------------------------------------------------------------------------------------------------

const backend = new FakeBackend();
before(async () => { await backend.start(); useBackend(backend); });
after(() => backend.stop());
let wsId = "";
beforeEach(() => { backend.tables = {}; wsId = randomUUID(); });
const admin = () => { const a = getAdmin(); if (isFailure(a)) throw new Error("no admin"); return a.admin; };
const feedOf = (...ids: string[]) => (async () => new Response(JSON.stringify(feed(ids.map((id) => row({ NEWSID: id, NEWSSUB: `Financial Results ${id}` })))), { status: 200 })) as unknown as typeof fetch;

test("a filing is stored once however often the watcher sees it, and new ones are added alongside", async () => {
  const first = await watchFilings(admin(), [{ id: wsId, bse_code: "532540" }], { fetchFn: feedOf("a", "b") });
  assert.deepEqual([first.checked, first.stored, first.failed], [1, 2, []]);
  const again = await watchFilings(admin(), [{ id: wsId, bse_code: "532540" }], { fetchFn: feedOf("a", "b", "c") });
  assert.equal(again.stored, 1);
  assert.deepEqual(backend.rowsOf("sentinel_filings").map((r) => r.external_id).sort(), ["a", "b", "c"]);
  assert.equal(backend.rowsOf("sentinel_filings")[0].status, "new");
});

test("a company with no scrip code is skipped, and a failing feed is reported against its company without stopping the rest", async () => {
  const other = randomUUID();
  const fetchFn = (async (url: string) => (String(url).includes("strScrip=111111") ? new Response("no", { status: 403 }) : new Response(JSON.stringify(feed([row({ NEWSID: "z", NEWSSUB: "Financial Results" })])), { status: 200 }))) as unknown as typeof fetch;
  const r = await watchFilings(admin(), [{ id: wsId, bse_code: null }, { id: other, bse_code: "111111" }, { id: randomUUID(), bse_code: "532540" }], { fetchFn });
  assert.equal(r.checked, 2);
  assert.equal(r.stored, 1);
  assert.deepEqual(r.failed, [`${other}: BSE answered 403.`]);
});
