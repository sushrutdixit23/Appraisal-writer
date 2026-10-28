// /api/sentinel/market/refresh: the price lands with its date and source, a split-sized jump waits for a yes, and a
// database without the newest columns still gets the price.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/market/refresh/route";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const backend = new FakeBackend();
const realFetch = globalThis.fetch;
let ws = "", wsRef = "";
let closePrice = "3500";

const HEADER = "SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER";
const row = (s: string, c: string, d: string) => `${s}, EQ, ${d}, 1, 1, 1, 1, ${c}, ${c}, 1, 1, 1, 1, 1, 1`;
const bhav = (d: string) => [HEADER, row("TCS", closePrice, d), ...Array.from({ length: 60 }, (_, i) => row(`F${i}`, "10", d))].join("\n");

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  // Only the exchange file is faked; everything else (the fake database) goes to the real fetch.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("nsearchives.nseindia.com")) {
      const m = /full_(\d{2})(\d{2})(\d{4})\.csv/.exec(url)!;
      const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
      return url.includes(`${m[1]}${m[2]}${m[3]}`) && `${m[3]}-${m[2]}-${m[1]}` === today ? new Response(bhav(`${m[1]}-Jan-2000`.replace("Jan", ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m[2]) - 1]).replace("2000", m[3]))) : new Response("nope", { status: 404 });
    }
    if (url.includes("query1.finance.yahoo.com")) return new Response("{}", { status: 404 });
    return realFetch(input, init);
  }) as typeof fetch;
});
after(async () => { globalThis.fetch = realFetch; await backend.stop(); });
beforeEach(() => {
  resetRateLimits();
  closePrice = "3500";
  ws = randomUUID(); wsRef = randomUUID();
  const base = { sector: "technology", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", currency_unit: "INR_CRORE" };
  backend.tables = { sentinel_workspaces: [
    { id: ws, owner_id: A, company_name: "TCS", is_public_reference: false, market_price: 3400, market_price_as_of: "2026-01-01", ...base },
    { id: wsRef, owner_id: null, company_name: "Ref", is_public_reference: true, ...base },
  ] };
});

const call = (body: unknown, token: string | null = "tok-a") =>
  POST(new Request("http://localhost/api/sentinel/market/refresh", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

test("the exchange price is saved with its date, its source and the symbol", async () => {
  const r = await call({ workspace_id: ws, ticker: "TCS" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const w = backend.rowsOf("sentinel_workspaces").find((x) => x.id === ws)!;
  assert.equal(w.market_price, 3500);
  assert.equal(w.market_price_source, "NSE bhavcopy");
  assert.equal(w.ticker, "TCS");
  assert.match(w.market_price_as_of, /^\d{4}-\d{2}-\d{2}$/);
});

test("a split-sized jump is refused with a 409 until the caller accepts it", async () => {
  closePrice = "1700";
  const held = await call({ workspace_id: ws, ticker: "TCS" });
  assert.equal(held.status, 409);
  assert.equal(held.json.suspicious, true);
  assert.equal(backend.rowsOf("sentinel_workspaces").find((x) => x.id === ws)!.market_price, 3400, "nothing was saved");
  const accepted = await call({ workspace_id: ws, ticker: "TCS", accept: true });
  assert.equal(accepted.status, 200);
  assert.equal(backend.rowsOf("sentinel_workspaces").find((x) => x.id === ws)!.market_price, 1700);
});

test("an unknown symbol is a clear 422 and leaves the stored price alone", async () => {
  const r = await call({ workspace_id: ws, ticker: "NOSUCH" });
  assert.equal(r.status, 422);
  assert.equal(backend.rowsOf("sentinel_workspaces").find((x) => x.id === ws)!.market_price, 3400);
});

test("a reference company, a stranger and a bad symbol are all refused", async () => {
  assert.equal((await call({ workspace_id: wsRef, ticker: "TCS" })).status, 403);
  assert.equal((await call({ workspace_id: ws, ticker: "TCS" }, null)).status, 401);
  const none = await call({ workspace_id: ws, ticker: "bad symbol!!" });
  assert.equal(none.status, 422); // an unusable symbol is treated as no symbol
});

test("a database without the ticker/source columns still gets the price", async () => {
  backend.failNext = { table: "sentinel_workspaces", method: "PATCH", status: 400, body: { code: "PGRST204", message: "Could not find the 'ticker' column of 'sentinel_workspaces' in the schema cache" } };
  const r = await call({ workspace_id: ws, ticker: "TCS" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const w = backend.rowsOf("sentinel_workspaces").find((x) => x.id === ws)!;
  assert.equal(w.market_price, 3500);
  assert.ok(!("ticker" in w));
});
