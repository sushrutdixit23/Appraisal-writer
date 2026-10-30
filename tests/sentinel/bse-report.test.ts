// Fetching an annual report from BSE, against a FAKE BSE: the shapes are the ones the open-source `bse` client documents, not a live call. These tests prove the
// logic around them (which announcement is picked, which hosts are talked to, what a refusal says), not that bseindia.com answers a cloud server.

import test from "node:test";
import assert from "node:assert/strict";
import { attachmentUrls, downloadPdf, fetchAnnualReport, findAnnualReport, isBseUrl } from "../../app/sentinel/lib/bseReport";
import { parseBseAnnouncements } from "../../app/sentinel/lib/filings";

const NOW = new Date("2026-10-30T00:00:00Z");
const PDF = Buffer.from("%PDF-1.7\n" + "x".repeat(200));
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;
const fakeFetch = (handler: Handler): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)), init)) as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ann = (id: string, sub: string, when: string, file: string | null) => ({ NEWSID: id, NEWSSUB: sub, HEADLINE: sub, SUBCATNAME: "", DT_TM: when, ATTACHMENTNAME: file, NSURL: `https://www.bseindia.com/stock-share-price/x/y/500325/corp-announcements/${id}` });
const dateOf = (u: URL, k: string) => u.searchParams.get(k)!;

test("only bseindia.com and its subdomains over https are ever fetched", () => {
  for (const ok of ["https://www.bseindia.com/xml-data/corpfiling/AttachLive/a.pdf", "https://api.bseindia.com/x", "https://bseindia.com/a.pdf"]) assert.equal(isBseUrl(ok), true, ok);
  for (const bad of ["http://www.bseindia.com/a.pdf", "https://bseindia.com.evil.com/a.pdf", "https://evilbseindia.com/a.pdf", "https://user:pw@www.bseindia.com/a.pdf", "https://169.254.169.254/latest", "file:///etc/passwd", "not a url"]) assert.equal(isBseUrl(bad), false, bad);
});

test("an attachment name becomes two candidate addresses; anything that is not a plain file name becomes none", () => {
  assert.deepEqual(attachmentUrls("5d6f2a-ann rpt 2026.pdf"), [
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/5d6f2a-ann%20rpt%202026.pdf",
    "https://www.bseindia.com/xml-data/corpfiling/AttachHis/5d6f2a-ann%20rpt%202026.pdf",
  ]);
  for (const bad of ["../secret.pdf", "a/b.pdf", "http://evil.example/x.pdf", "notes.txt", "", ".pdf", "x.pdf?next=http://evil"]) assert.deepEqual(attachmentUrls(bad), [], bad);
});

test("the feed parser keeps the attachment name and drops a blank one", () => {
  const out = parseBseAnnouncements({ Table: [ann("1", "Annual Report for FY 2025-26", "2026-08-01T10:00:00", " AR.pdf "), ann("2", "Annual Report for FY 2024-25", "2025-08-01T10:00:00", "")] });
  assert.deepEqual(out.map((f) => [f.external_id, f.attachment]), [["1", "AR.pdf"], ["2", null]]);
});

test("the newest annual report that has a file attached is chosen, not a results announcement, not one with no file", async () => {
  const feed = fakeFetch((u) => json({ Table: [
    ann("r", "Financial Results for the quarter ended September 30, 2026", "2026-10-20T10:00:00", "results.pdf"),
    ann("old", "Annual Report for FY 2024-25", "2025-08-01T10:00:00", "old.pdf"),
    ann("nofile", "Annual Report 2025-26 (link only)", "2026-09-01T10:00:00", null),
    ann("new", "Submission of Annual Report for FY 2025-26", "2026-08-05T10:00:00", "new.pdf"),
  ] }));
  const r = await findAnnualReport("500325", NOW, feed);
  assert.ok(r.ok);
  assert.equal(r.ok && r.report.external_id, "new");
  assert.equal(r.ok && r.report.attachment, "new.pdf");
});

test("it searches back a quarter at a time and follows pages, and says so when nothing is there", async () => {
  const seen: string[] = [];
  const feed = fakeFetch((u) => {
    seen.push(`${dateOf(u, "strPrevDate")}-${dateOf(u, "strToDate")}-p${dateOf(u, "pageno")}`);
    const first = dateOf(u, "strToDate") === "20261030";
    if (first) return json({ Table: dateOf(u, "pageno") === "1" ? [ann("x", "Board meeting intimation", "2026-10-01T10:00:00", "x.pdf")] : [] });
    // the second window (about May to July) holds the report, on its second page
    if (dateOf(u, "strToDate") === "20260801") return json({ Table: dateOf(u, "pageno") === "1" ? [ann("y", "Trading window closure", "2026-07-01T10:00:00", null)] : [ann("ar", "Annual Report FY26", "2026-07-15T10:00:00", "ar.pdf")] });
    return json({ Table: [] });
  });
  const found = await findAnnualReport("500325", NOW, feed);
  assert.ok(found.ok && found.report.external_id === "ar");
  assert.ok(seen.length >= 4);
  const none = await findAnnualReport("500325", NOW, fakeFetch(() => json({ Table: [] })));
  assert.deepEqual(none.ok, false);
  assert.match(!none.ok ? none.error : "", /No annual report with a file attached.*last fifteen months.*Paste the PDF's address/);
});

test("a refusal, a non-JSON reply, a changed format and a bad scrip code each say what failed", async () => {
  const e2 = async (code: string) => { const r = await findAnnualReport(code, NOW, fakeFetch(() => json({}))); return r.ok ? "" : r.error; };
  const e = async (h: Handler) => { const r = await findAnnualReport("500325", NOW, fakeFetch(h)); return r.ok ? "" : r.error; };
  assert.equal(await e(() => new Response("denied", { status: 403 })), "BSE answered 403 to the announcements request.");
  assert.match(await e(() => new Response("<html>captcha</html>", { status: 200 })), /did not return JSON.*refusing automated requests/);
  assert.match(await e(() => json({ rows: [] })), /no announcement list; the feed format may have changed/);
  assert.match(await e(() => { throw new Error("getaddrinfo ENOTFOUND"); }), /Could not reach BSE: getaddrinfo ENOTFOUND/);
  assert.match(await e2("abc"), /"abc" is not a BSE scrip code/);
});

test("a download keeps to BSE, follows a redirect that stays there, and refuses one that leaves", async () => {
  const stays = fakeFetch((u) => u.pathname.endsWith("/start.pdf") ? new Response(null, { status: 302, headers: { location: "/xml-data/corpfiling/AttachHis/end.pdf" } }) : new Response(PDF, { status: 200 }));
  const ok = await downloadPdf("https://www.bseindia.com/xml-data/corpfiling/AttachLive/start.pdf", stays);
  assert.ok(ok.ok && ok.url.endsWith("/AttachHis/end.pdf") && ok.buffer.length === PDF.length);
  const leaves = fakeFetch(() => new Response(null, { status: 302, headers: { location: "https://evil.example/x.pdf" } }));
  const bad = await downloadPdf("https://www.bseindia.com/a.pdf", leaves);
  assert.deepEqual([bad.ok, !bad.ok && bad.error], [false, "Only files hosted on bseindia.com can be fetched."]);
  const loop = fakeFetch(() => new Response(null, { status: 302, headers: { location: "/again.pdf" } }));
  assert.match((await downloadPdf("https://www.bseindia.com/a.pdf", loop) as { error: string }).error, /too many times/);
  assert.match((await downloadPdf("http://169.254.169.254/latest/meta-data", stays) as { error: string }).error, /Only files hosted on bseindia.com/);
});

test("a file that is not a PDF, is missing, or is too large is refused with the reason", async () => {
  const html = await downloadPdf("https://www.bseindia.com/a.pdf", fakeFetch(() => new Response("<html>Please enter the captcha</html>", { status: 200 })));
  assert.match(!html.ok ? html.error : "", /not a PDF/);
  const gone = await downloadPdf("https://www.bseindia.com/a.pdf", fakeFetch(() => new Response("no", { status: 404 })));
  assert.equal(!gone.ok && gone.error, "BSE answered 404 for the file.");
  const declared = await downloadPdf("https://www.bseindia.com/a.pdf", fakeFetch(() => new Response(PDF, { status: 200, headers: { "content-length": String(500 * 1024 * 1024) } })));
  assert.match(!declared.ok ? declared.error : "", /500 MB, over the 60 MB limit/);
  const streamed = await downloadPdf("https://www.bseindia.com/a.pdf", fakeFetch(() => new Response(PDF, { status: 200 })), 50);
  assert.match(!streamed.ok ? streamed.error : "", /larger than the/);
});

test("the live folder is tried first, then the history folder; when both fail the message names both and gives the announcement's page", async () => {
  const calls: string[] = [];
  const feed: Handler = (u) => {
    if (u.hostname === "api.bseindia.com") return json({ Table: [ann("ar", "Annual Report FY26", "2026-08-05T10:00:00", "ar2026.pdf")] });
    calls.push(u.pathname);
    return u.pathname.includes("AttachHis") ? new Response(PDF, { status: 200 }) : new Response("no", { status: 404 });
  };
  const ok = await fetchAnnualReport("500325", NOW, fakeFetch(feed));
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.filename, "ar2026.pdf");
  assert.deepEqual(calls, ["/xml-data/corpfiling/AttachLive/ar2026.pdf", "/xml-data/corpfiling/AttachHis/ar2026.pdf"]);

  const failing = await fetchAnnualReport("500325", NOW, fakeFetch((u) => (u.hostname === "api.bseindia.com" ? json({ Table: [ann("ar", "Annual Report FY26", "2026-08-05T10:00:00", "ar2026.pdf")] }) : new Response("no", { status: 404 }))));
  assert.ok(!failing.ok);
  const msg = !failing.ok ? failing.error : "";
  assert.match(msg, /AttachLive: BSE answered 404/);
  assert.match(msg, /AttachHis: BSE answered 404/);
  assert.match(msg, /Its page: https:\/\/www\.bseindia\.com\/stock-share-price/);
});
