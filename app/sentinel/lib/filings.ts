// Sentinel - the filing watcher: has a covered company filed new results or an annual report? Reads BSE's corporate
// announcements feed for each company that has a BSE scrip code, keeps only results and annual-report announcements,
// and stores each once. The digest then lists them under "new filings", with a link to the company's BSE page.
//
// What is checked and what is not. The request parameters and the response shape (a "Table" list of announcements with
// NEWSID, NEWSSUB, HEADLINE, SUBCATNAME, DT_TM, ATTACHMENTNAME, NSURL) come from the open-source `bse` client's source
// and its sample response, not from a live call: this sandbox cannot reach the exchange. The parser is tested against
// that sample's shape. Whether BSE answers a cloud server's request (it can refuse non-browser traffic) is learned the
// first time the cron runs, and a refusal is reported in the cron's response, never swallowed.

export type FilingKind = "results" | "annual_report";

export type Filing = {
  external_id: string;
  kind: FilingKind;
  headline: string;
  filed_at: string; // ISO timestamp as BSE prints it (India time, no zone)
  url: string | null;
};

const BASE = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w";

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export function bseAnnouncementsUrl(scripCode: string, from: Date, to: Date): string {
  const q = new URLSearchParams({ pageno: "1", strCat: "-1", subcategory: "-1", strPrevDate: ymd(from), strToDate: ymd(to), strSearch: "P", strScrip: scripCode, strType: "C" });
  return `${BASE}?${q}`;
}

/** Results or annual report, from the words BSE puts in the subject, headline and subcategory. Everything else (trading-window
 * notices, share-certificate duplicates, board-meeting intimations) is not a new set of figures. */
export function classifyAnnouncement(text: string): FilingKind | null {
  const t = text.toLowerCase();
  if (/\bannual report\b/.test(t) && !/\bnotice of (the )?\d*\w* ?(annual general|agm)/.test(t)) return "annual_report";
  // "Outcome of Board Meeting" carries the results when its text says so; a bare "intimation" of a meeting does not.
  if (/(financial results|unaudited.*results|audited.*results|results for the (quarter|year|half))/.test(t) && !/\bintimation of\b.*\bboard meeting\b/.test(t)) return "results";
  return null;
}

/** The announcements in one feed response that are filings. Tolerates missing fields (BSE leaves CATEGORYNAME null) and
 * a malformed body, returning nothing rather than throwing. */
export function parseBseAnnouncements(json: unknown): Filing[] {
  const table = (json as { Table?: unknown } | null)?.Table;
  if (!Array.isArray(table)) return [];
  const out: Filing[] = [];
  for (const raw of table) {
    const r = raw as Record<string, unknown>;
    const id = typeof r.NEWSID === "string" ? r.NEWSID : null;
    const when = typeof r.DT_TM === "string" ? r.DT_TM : typeof r.NEWS_DT === "string" ? r.NEWS_DT : null;
    if (!id || !when) continue;
    const headline = [r.NEWSSUB, r.HEADLINE].filter((x): x is string => typeof x === "string" && x.trim() !== "").join(" - ");
    const kind = classifyAnnouncement([r.NEWSSUB, r.HEADLINE, r.SUBCATNAME, r.CATEGORYNAME].filter((x) => typeof x === "string").join(" "));
    if (!kind) continue;
    out.push({ external_id: id, kind, headline: headline.slice(0, 400), filed_at: when, url: typeof r.NSURL === "string" && /^https?:\/\//.test(r.NSURL) ? r.NSURL : null });
  }
  return out;
}

export type FilingCheck = { ok: true; filings: Filing[] } | { ok: false; error: string };

/** One company's announcements for the last `days` days. */
export async function fetchFilings(scripCode: string, now: Date = new Date(), days = 10, fetchFn: typeof fetch = fetch): Promise<FilingCheck> {
  if (!/^\d{5,6}$/.test(scripCode)) return { ok: false, error: `"${scripCode}" is not a BSE scrip code (5-6 digits).` };
  const from = new Date(now.getTime() - days * 86_400_000);
  try {
    const res = await fetchFn(bseAnnouncementsUrl(scripCode, from, now), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Sentinel/1.0)", accept: "application/json, text/plain, */*", origin: "https://www.bseindia.com", referer: "https://www.bseindia.com/" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `BSE answered ${res.status}.` };
    let json: unknown;
    try { json = await res.json(); } catch { return { ok: false, error: "BSE did not return JSON (it may be refusing automated requests)." }; }
    if (!json || typeof json !== "object" || !Array.isArray((json as { Table?: unknown }).Table)) return { ok: false, error: "BSE's reply had no announcement list; the feed format may have changed." };
    return { ok: true, filings: parseBseAnnouncements(json) };
  } catch (e) {
    return { ok: false, error: `Could not reach BSE: ${(e as Error).message}` };
  }
}
