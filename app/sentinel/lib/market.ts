// Sentinel - end-of-day share prices, so peer valuation (market cap, EV, P/E, EV/EBITDA, EV/Sales) runs on
// a real, dated closing price instead of one somebody typed in months ago.
//
// Sources, in order, each behind the same shape so one can fail without taking the others down:
//   1. The NSE "full bhavcopy" - the exchange's own end-of-day file of every listed equity, published free and
//      without a key. One download prices every company at once. Official, so it is tried first.
//   2. Yahoo Finance's chart endpoint, per symbol - unofficial and unsupported, so only a fallback for a
//      symbol the bhavcopy does not list (a BSE-only company) or when the file is not up yet.
//   3. The existing manual price - never touched here; a refresh that finds nothing leaves it as it was.
//
// NOT VERIFIED AGAINST THE LIVE SERVICES: the sandbox this was written in cannot reach NSE, BSE or Yahoo, so the
// parsers are written from their published formats and tested on fixtures in that format, not on captured
// responses. Every parser fails closed - a response it cannot read becomes an error, never a guessed price.
//
// A price is only ever applied to a company by its caller after refreshPrices says it looks sane: the guard
// below refuses a move of more than 40% from the previous price, because a split or bonus issue makes the
// price fall while the filing's share count (from before the split) does not - market cap would silently
// be wrong by the split ratio.

import { parseCsv } from "./autofill/sheet";

export type Quote = { price: number; as_of: string };

export type MarketTarget = {
  id: string;
  /** NSE trading symbol, e.g. "TCS". */
  ticker: string | null;
  /** BSE scrip code, e.g. "532540". */
  bse_code: string | null;
  previous_price: number | null;
};

export type RefreshResult =
  | { id: string; ok: true; price: number; as_of: string; source: string; suspicious: string | null }
  | { id: string; ok: false; error: string };

/** A move this large between two closes is more likely a corporate action than a real move. */
export const SUSPICIOUS_MOVE = 0.4;
/** A quote older than this is the exchange being shut, or a dead source - not a current price. */
export const MAX_QUOTE_AGE_DAYS = 10;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** The calendar date in India (UTC+5:30) of an instant - an exchange's "today", whatever the server's clock zone. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function nseBhavcopyUrl(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${d}${m}${y}.csv`;
}

/** "27-Oct-2026" -> "2026-10-27"; null for anything else. */
function parseNseDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

/** Closing prices by symbol from an NSE full bhavcopy. Only the plain equity series ("EQ") is read: other series
 * (trade-for-trade, SME, bonds) share symbols with it and trade on different terms. Returns an empty map for text
 * that is not a bhavcopy (an HTML error page, a truncated file) rather than throwing. */
export function parseNseBhavcopy(csv: string, fallbackDate: string): Map<string, Quote> {
  const out = new Map<string, Quote>();
  const rows = parseCsv(csv);
  if (rows.length < 2) return out;
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name: string) => header.indexOf(name);
  const iSymbol = col("SYMBOL"), iSeries = col("SERIES"), iDate = col("DATE1"), iClose = col("CLOSE_PRICE");
  if (iSymbol < 0 || iSeries < 0 || iClose < 0) return out;
  for (const r of rows.slice(1)) {
    if ((r[iSeries] ?? "").trim().toUpperCase() !== "EQ") continue;
    const price = Number((r[iClose] ?? "").trim().replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) continue;
    const symbol = (r[iSymbol] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    out.set(symbol, { price, as_of: (iDate >= 0 ? parseNseDate(r[iDate] ?? "") : null) ?? fallbackDate });
  }
  return out;
}

/** The latest close from a Yahoo chart response; null when it is not one (an error object, an empty result). */
export function parseYahooChart(json: unknown): Quote | null {
  const result = (json as { chart?: { result?: { meta?: { regularMarketPrice?: unknown; regularMarketTime?: unknown } }[] } })?.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  const time = result?.meta?.regularMarketTime;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (typeof time !== "number" || !Number.isFinite(time)) return null;
  return { price, as_of: istDate(new Date(time * 1000)) };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

type Deps = { fetchFn?: typeof fetch; now?: Date };

async function get(fetchFn: typeof fetch, url: string): Promise<Response | null> {
  try {
    return await fetchFn(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; Sentinel/1.0)", accept: "*/*" }, signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
}

/** The most recent bhavcopy on file, looking back over weekends and market holidays. Needs a plausible number of
 * rows (a real file lists thousands of equities) so a stub page cannot pass for one. */
export async function latestBhavcopy(deps: Deps = {}): Promise<{ quotes: Map<string, Quote>; as_of: string } | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const today = istDate(deps.now ?? new Date());
  for (let back = 0; back <= 6; back++) {
    const date = istDate(new Date(Date.parse(`${today}T00:00:00Z`) - back * 86_400_000));
    const res = await get(fetchFn, nseBhavcopyUrl(date));
    if (!res || !res.ok) continue;
    const quotes = parseNseBhavcopy(await res.text(), date);
    if (quotes.size >= 50) return { quotes, as_of: date };
  }
  return null;
}

async function yahooQuote(symbol: string, fetchFn: typeof fetch): Promise<Quote | null> {
  const res = await get(fetchFn, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  if (!res || !res.ok) return null;
  try {
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
}

function judge(id: string, q: Quote, source: string, previous: number | null, today: string): RefreshResult {
  const age = daysBetween(q.as_of, today);
  if (age > MAX_QUOTE_AGE_DAYS) return { id, ok: false, error: `The newest price found (${q.as_of}, from ${source}) is ${age} days old.` };
  let suspicious: string | null = null;
  if (previous != null && previous > 0) {
    const move = q.price / previous - 1;
    if (Math.abs(move) > SUSPICIOUS_MOVE) {
      suspicious = `The price moved ${(move * 100).toFixed(0)}% (${previous} to ${q.price}). A split or bonus issue looks like this and would make market cap wrong until the share count is updated, so it was not applied.`;
    }
  }
  return { id, ok: true, price: q.price, as_of: q.as_of, source, suspicious };
}

/** One price per target, from the best source that has one. Never throws; a company that could not be priced comes
 * back as { ok: false, error } so the caller can say why and leave its stored price alone. */
export async function refreshPrices(targets: MarketTarget[], deps: Deps = {}): Promise<RefreshResult[]> {
  const fetchFn = deps.fetchFn ?? fetch;
  const today = istDate(deps.now ?? new Date());
  const wanted = targets.filter((t) => t.ticker || t.bse_code);
  const results: RefreshResult[] = targets
    .filter((t) => !t.ticker && !t.bse_code)
    .map((t) => ({ id: t.id, ok: false as const, error: "No ticker or BSE code is set for this company." }));
  if (wanted.length === 0) return results;

  const bhav = wanted.some((t) => t.ticker) ? await latestBhavcopy({ fetchFn, now: deps.now }) : null;
  for (const t of wanted) {
    const fromFile = t.ticker ? bhav?.quotes.get(t.ticker.trim().toUpperCase()) : undefined;
    if (fromFile) {
      results.push(judge(t.id, fromFile, "NSE bhavcopy", t.previous_price, today));
      continue;
    }
    const symbols = [t.ticker ? `${t.ticker.trim().toUpperCase()}.NS` : null, t.bse_code ? `${t.bse_code.trim()}.BO` : null].filter((s): s is string => !!s);
    let found: RefreshResult | null = null;
    for (const symbol of symbols) {
      const q = await yahooQuote(symbol, fetchFn);
      if (q) { found = judge(t.id, q, `Yahoo Finance (${symbol})`, t.previous_price, today); break; }
    }
    results.push(found ?? { id: t.id, ok: false, error: "No price source had a quote for this symbol." });
  }
  return results;
}
