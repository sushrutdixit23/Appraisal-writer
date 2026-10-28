// End-of-day price sources. The fixtures follow the published formats (NSE full bhavcopy, Yahoo chart JSON); they are
// not captured from the live services, which the sandbox these were written in cannot reach. The point of these tests
// is that every parser fails closed and every guard (staleness, a split-sized jump) does what it says.

import test from "node:test";
import assert from "node:assert/strict";
import { istDate, latestBhavcopy, nseBhavcopyUrl, parseNseBhavcopy, parseYahooChart, refreshPrices } from "../../app/sentinel/lib/market";

const HEADER = "SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER";
const line = (symbol: string, series: string, date: string, close: string) =>
  `${symbol}, ${series}, ${date}, 100.00, 100.00, 105.00, 99.00, ${close}, ${close}, 101.00, 1000, 10.00, 50, 600, 60.00`;

/** A bhavcopy with the named symbols and enough filler rows to look like a real file. */
function bhavcopy(date: string, rows: [string, string][]): string {
  const filler = Array.from({ length: 60 }, (_, i) => line(`FILL${i}`, "EQ", date, "10.00"));
  return [HEADER, ...rows.map(([s, close]) => line(s, "EQ", date, close)), line("TCS", "BE", date, "1.00"), ...filler].join("\n");
}

function fakeFetch(routes: Record<string, () => Response>, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const handler = Object.entries(routes).find(([k]) => url.includes(k))?.[1];
    return handler ? handler() : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test("the bhavcopy URL is the exchange's own naming, day-month-year", () => {
  assert.equal(nseBhavcopyUrl("2026-10-27"), "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_27102026.csv");
});

test("an exchange 'today' is the India date, not the server's: 20:00 UTC is already tomorrow in Mumbai", () => {
  assert.equal(istDate(new Date("2026-10-26T20:00:00Z")), "2026-10-27");
  assert.equal(istDate(new Date("2026-10-27T05:00:00Z")), "2026-10-27");
});

test("bhavcopy: reads the equity series only, trims the padded cells, takes the file's own date", () => {
  const q = parseNseBhavcopy(bhavcopy("27-Oct-2026", [["TCS", "3512.40"], ["INFY", "1500.50"]]), "1999-01-01");
  assert.deepEqual(q.get("TCS"), { price: 3512.4, as_of: "2026-10-27" }); // the BE-series TCS row (1.00) is ignored
  assert.equal(q.get("INFY")?.price, 1500.5);
});

test("bhavcopy: an HTML error page or a truncated file is not a bhavcopy - empty, not a throw, not a guess", () => {
  assert.equal(parseNseBhavcopy("<html><body>Access Denied</body></html>", "2026-10-27").size, 0);
  assert.equal(parseNseBhavcopy("", "2026-10-27").size, 0);
  assert.equal(parseNseBhavcopy("SYMBOL, SERIES\nTCS, EQ", "2026-10-27").size, 0); // no close-price column
});

test("bhavcopy: a zero or non-numeric close is skipped rather than recorded", () => {
  const q = parseNseBhavcopy([HEADER, line("AAA", "EQ", "27-Oct-2026", "0.00"), line("BBB", "EQ", "27-Oct-2026", "-"), line("CCC", "EQ", "27-Oct-2026", "5.00")].join("\n"), "2026-10-27");
  assert.deepEqual([...q.keys()], ["CCC"]);
});

test("yahoo: the latest price and its India-date, and null for anything that is not a quote", () => {
  const ok = { chart: { result: [{ meta: { regularMarketPrice: 1234.5, regularMarketTime: Date.parse("2026-10-27T10:00:00Z") / 1000 } }], error: null } };
  assert.deepEqual(parseYahooChart(ok), { price: 1234.5, as_of: "2026-10-27" });
  assert.equal(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } }), null);
  assert.equal(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0, regularMarketTime: 1 } }] } }), null);
  assert.equal(parseYahooChart("nope"), null);
});

test("the newest bhavcopy is found by walking back over a weekend of missing files", async () => {
  const seen: string[] = [];
  const now = new Date("2026-10-26T06:00:00Z"); // Monday morning in India, file for the day not out yet
  const f = fakeFetch({ "25102026": () => new Response(bhavcopy("23-Oct-2026", [["TCS", "3500"]])) }, seen);
  const found = await latestBhavcopy({ fetchFn: f, now });
  assert.equal(found?.quotes.get("TCS")?.price, 3500);
  assert.equal(found?.as_of, "2026-10-25"); // the URL's date; the rows carry their own date
  assert.equal(seen.length, 2); // Monday (404), then Sunday the 25th (the fixture serves that URL)
});

test("a stub page with a 200 status is not accepted as a bhavcopy", async () => {
  const f = fakeFetch({ "sec_bhavdata_full": () => new Response(`${HEADER}\n${line("TCS", "EQ", "27-Oct-2026", "3500")}`) });
  assert.equal(await latestBhavcopy({ fetchFn: f, now: new Date("2026-10-27T10:00:00Z") }), null);
});

test("refresh: the official file prices NSE companies; a BSE-only company falls back to Yahoo; a company with no symbol says so", async () => {
  const chart = { chart: { result: [{ meta: { regularMarketPrice: 777, regularMarketTime: Date.parse("2026-10-27T09:00:00Z") / 1000 } }] } };
  const f = fakeFetch({
    "sec_bhavdata_full_27102026": () => new Response(bhavcopy("27-Oct-2026", [["TCS", "3500"]])),
    "chart/532540.BO": () => new Response(JSON.stringify(chart)),
  });
  const r = await refreshPrices(
    [
      { id: "tcs", ticker: "tcs", bse_code: null, previous_price: 3400 },
      { id: "bseonly", ticker: null, bse_code: "532540", previous_price: 700 },
      { id: "none", ticker: null, bse_code: null, previous_price: null },
    ],
    { fetchFn: f, now: new Date("2026-10-27T10:00:00Z") }
  );
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.deepEqual(by.tcs, { id: "tcs", ok: true, price: 3500, as_of: "2026-10-27", source: "NSE bhavcopy", suspicious: null });
  assert.equal(by.bseonly.ok && by.bseonly.price, 777);
  assert.match((by.bseonly as any).source, /Yahoo Finance \(532540\.BO\)/);
  assert.equal(by.none.ok, false);
});

test("refresh: a split-sized jump is reported as suspicious so it is not applied silently", async () => {
  const f = fakeFetch({ "sec_bhavdata_full_27102026": () => new Response(bhavcopy("27-Oct-2026", [["TCS", "1750"]])) });
  const [r] = await refreshPrices([{ id: "tcs", ticker: "TCS", bse_code: null, previous_price: 3500 }], { fetchFn: f, now: new Date("2026-10-27T10:00:00Z") });
  assert.ok(r.ok && r.suspicious && /split or bonus/.test(r.suspicious), JSON.stringify(r));
  const [calm] = await refreshPrices([{ id: "tcs", ticker: "TCS", bse_code: null, previous_price: 1700 }], { fetchFn: f, now: new Date("2026-10-27T10:00:00Z") });
  assert.ok(calm.ok && calm.suspicious === null);
});

test("refresh: a price older than ten days is refused as stale, and unreachable sources are an error, not a throw", async () => {
  const stale = fakeFetch({ "sec_bhavdata_full": () => new Response(bhavcopy("01-Oct-2026", [["TCS", "3500"]])) });
  const [s] = await refreshPrices([{ id: "tcs", ticker: "TCS", bse_code: null, previous_price: null }], { fetchFn: stale, now: new Date("2026-10-27T10:00:00Z") });
  assert.equal(s.ok, false);
  const down = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const [d] = await refreshPrices([{ id: "tcs", ticker: "TCS", bse_code: null, previous_price: 100 }], { fetchFn: down, now: new Date("2026-10-27T10:00:00Z") });
  assert.deepEqual(d, { id: "tcs", ok: false, error: "No price source had a quote for this symbol." });
});
