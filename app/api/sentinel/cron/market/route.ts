// Sentinel - refresh the closing price of every company that has a ticker, from one download of the exchange's file.
// A move that looks like a split or bonus is reported and NOT applied (see lib/market.ts).

import { NextResponse } from "next/server";
import { cronAuthorised, cronRefusal } from "../../../../sentinel/lib/cron";
import { refreshPrices } from "../../../../sentinel/lib/market";
import { getAdmin, isFailure } from "../../../../sentinel/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return cronRefusal();
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const { data, error } = await a.admin.from("sentinel_workspaces").select("id,ticker,bse_code,market_price");
  // The columns come from a hand-run migration; before it, there is nothing to refresh.
  if (error) return NextResponse.json({ updated: 0, note: "No tickers are stored yet (run the market-feed migration)." });
  const targets = (data ?? []).filter((w) => w.ticker || w.bse_code).map((w) => ({ id: w.id as string, ticker: w.ticker as string | null, bse_code: w.bse_code as string | null, previous_price: (w.market_price as number | null) ?? null }));
  const results = await refreshPrices(targets);
  let updated = 0;
  const held: string[] = [];
  const failed: string[] = [];
  for (const r of results) {
    if (!r.ok) { failed.push(`${r.id}: ${r.error}`); continue; }
    if (r.suspicious) { held.push(`${r.id}: ${r.suspicious}`); continue; }
    const { error: e } = await a.admin.from("sentinel_workspaces").update({ market_price: r.price, market_price_as_of: r.as_of, market_price_source: r.source }).eq("id", r.id);
    if (e) failed.push(`${r.id}: ${e.message}`); else updated++;
  }
  return NextResponse.json({ updated, held, failed });
}
