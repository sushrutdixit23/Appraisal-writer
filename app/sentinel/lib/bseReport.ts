// Sentinel - fetching a company's latest annual report from BSE, so it need not be downloaded and uploaded by hand.
//
// UNVERIFIED AGAINST THE LIVE SITE. This sandbox cannot reach bseindia.com, so none of this has run against the real exchange. What is built here is:
//  - the announcement feed (api.bseindia.com ... AnnSubCategoryGetData) read as filings.ts already reads it, now keeping each announcement's attachment name;
//  - the places BSE is reported to serve an announcement's PDF from (www.bseindia.com/xml-data/corpfiling/AttachLive/<name> and .../AttachHis/<name>), tried in turn;
//  - a download that only ever talks to bseindia.com, follows no redirect to anywhere else, stops at a size cap, and accepts only something that starts "%PDF-".
// All of it is tested against a fake BSE that returns the shapes described above. What a real run will teach, and this file cannot: whether BSE answers a cloud
// server at all (it can refuse non-browser traffic), whether the attachment name is the whole path, and which of the two folders holds an older file. Every failure
// comes back as a sentence saying which step failed, and the person can paste the PDF's address from BSE's own page instead (the same host rules apply).
//
// Nothing here writes to the database. The file goes through the same reader as an upload, and the person reviews the preview before anything is saved.

import { bseAnnouncementsUrl, parseBseAnnouncements } from "./filings";

export const MAX_PDF_BYTES = 60 * 1024 * 1024;
const WINDOW_DAYS = 90;
const MAX_WINDOWS = 5; // up to about fifteen months back: one annual report cycle plus the filing lag
const MAX_PAGES = 5;
const MAX_REDIRECTS = 3;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; Sentinel/1.0)", accept: "application/pdf, application/json, */*", origin: "https://www.bseindia.com", referer: "https://www.bseindia.com/" };

export type AnnualReportRef = { external_id: string; headline: string; filed_at: string; attachment: string; page_url: string | null };

/** Only bseindia.com and its subdomains, over https: the one rule that stops this fetching an arbitrary address on someone's behalf. */
export function isBseUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && (u.hostname === "bseindia.com" || u.hostname.endsWith(".bseindia.com"));
}

/** The addresses an announcement's attachment may be served from, most likely first. The name is only ever a file name: a path or a full address in it is refused. */
export function attachmentUrls(attachment: string): string[] {
  const name = attachment.trim();
  if (!/^[\w][\w .()&%+,-]{0,200}\.pdf$/i.test(name)) return [];
  const enc = encodeURIComponent(name);
  return [`https://www.bseindia.com/xml-data/corpfiling/AttachLive/${enc}`, `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${enc}`];
}

type FetchFn = typeof fetch;

async function getJson(url: string, fetchFn: FetchFn): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, error: `BSE answered ${res.status} to the announcements request.` };
    try { return { ok: true, json: await res.json() }; } catch { return { ok: false, error: "BSE did not return JSON for the announcements request (it may be refusing automated requests)." }; }
  } catch (e) {
    return { ok: false, error: `Could not reach BSE: ${(e as Error).message}` };
  }
}

/** The newest annual-report announcement that carries an attachment, searching back through the feed a quarter at a time. */
export async function findAnnualReport(scripCode: string, now: Date = new Date(), fetchFn: FetchFn = fetch): Promise<{ ok: true; report: AnnualReportRef } | { ok: false; error: string }> {
  if (!/^\d{5,6}$/.test(scripCode)) return { ok: false, error: `"${scripCode}" is not a BSE scrip code (5-6 digits).` };
  let reached = false;
  for (let w = 0; w < MAX_WINDOWS; w++) {
    const to = new Date(now.getTime() - w * WINDOW_DAYS * 86_400_000);
    const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = bseAnnouncementsUrl(scripCode, from, to, page);
      const got = await getJson(url, fetchFn);
      if (!got.ok) return reached ? { ok: false, error: `${got.error} (searched back to ${from.toISOString().slice(0, 10)} without finding an annual report with a file attached.)` } : got;
      reached = true;
      const table = (got.json as { Table?: unknown } | null)?.Table;
      if (!Array.isArray(table)) return { ok: false, error: "BSE's reply had no announcement list; the feed format may have changed." };
      const hits = parseBseAnnouncements(got.json).filter((f) => f.kind === "annual_report" && f.attachment && attachmentUrls(f.attachment).length > 0).sort((a, b) => b.filed_at.localeCompare(a.filed_at));
      if (hits.length > 0) { const f = hits[0]; return { ok: true, report: { external_id: f.external_id, headline: f.headline, filed_at: f.filed_at, attachment: f.attachment!, page_url: f.url } }; }
      if (table.length === 0) break; // no further pages in this window
    }
  }
  return { ok: false, error: "No annual report with a file attached was found in BSE's announcements for the last fifteen months. Paste the PDF's address from BSE's annual-report page instead, or upload the file." };
}

/** One address, following up to a few redirects that stay on BSE, within the size cap, and only if it is a PDF. */
export async function downloadPdf(url: string, fetchFn: FetchFn = fetch, maxBytes = MAX_PDF_BYTES): Promise<{ ok: true; buffer: Buffer; url: string } | { ok: false; error: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isBseUrl(current)) return { ok: false, error: "Only files hosted on bseindia.com can be fetched." };
    let res: Response;
    try { res = await fetchFn(current, { headers: HEADERS, redirect: "manual", signal: AbortSignal.timeout(120_000) }); } catch (e) { return { ok: false, error: `Could not reach BSE: ${(e as Error).message}` }; }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { ok: false, error: `BSE redirected without saying where (${res.status}).` };
      try { current = new URL(next, current).toString(); } catch { return { ok: false, error: "BSE sent a redirect to an address that is not valid." }; }
      continue;
    }
    if (!res.ok) return { ok: false, error: `BSE answered ${res.status} for the file.` };
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, error: `The file is ${(declared / 1048576).toFixed(0)} MB, over the ${(maxBytes / 1048576).toFixed(0)} MB limit.` };
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "BSE sent an empty reply." };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return { ok: false, error: `The file is larger than the ${(maxBytes / 1048576).toFixed(0)} MB limit.` }; }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, error: "What BSE returned is not a PDF (a page asking for a captcha or a refusal looks like this)." };
    return { ok: true, buffer, url: current };
  }
  return { ok: false, error: "BSE redirected too many times." };
}

/** The annual report for a scrip code: finds the announcement, then tries each place its file may be served from, reporting what each said. */
export async function fetchAnnualReport(scripCode: string, now: Date = new Date(), fetchFn: FetchFn = fetch): Promise<{ ok: true; buffer: Buffer; filename: string; report: AnnualReportRef; url: string } | { ok: false; error: string }> {
  const found = await findAnnualReport(scripCode, now, fetchFn);
  if (!found.ok) return found;
  const tried: string[] = [];
  for (const url of attachmentUrls(found.report.attachment)) {
    const got = await downloadPdf(url, fetchFn);
    if (got.ok) return { ok: true, buffer: got.buffer, filename: found.report.attachment, report: found.report, url: got.url };
    tried.push(`${new URL(url).pathname.split("/").slice(-2, -1)[0]}: ${got.error}`);
  }
  return { ok: false, error: `Found the announcement (${found.report.headline.slice(0, 120)}, filed ${found.report.filed_at.slice(0, 10)}) but could not download its file. ${tried.join(" ")}${found.report.page_url ? ` Its page: ${found.report.page_url}` : ""}` };
}
