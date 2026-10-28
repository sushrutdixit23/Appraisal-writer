// Sentinel - fetch today's closing price for one company from the exchange's own file (see lib/market.ts) and save it
// with its date and source. A price that moved like a split or bonus issue is NOT saved unless the caller says to
// (accept: true), because market cap would be wrong by the split ratio until the share count catches up.

import { NextResponse } from "next/server";
import { refreshPrices } from "../../../../sentinel/lib/market";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../../sentinel/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const symbol = (v: unknown, max: number) => (typeof v === "string" && /^[A-Za-z0-9&._-]{1,20}$/.test(v.trim()) ? v.trim().slice(0, max) : null);
const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST204" || /could not find the .* column|column .* does not exist/i.test(e.message ?? ""));

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "market", 20, 10 * 60_000);
  if (limited) return limited.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("The request body is not valid JSON.", 400);
  }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  const w = loaded.workspace as typeof loaded.workspace & { ticker?: string | null; bse_code?: string | null };

  const ticker = body.ticker !== undefined ? symbol(body.ticker, 20) : w.ticker ?? null;
  const bseCode = body.bse_code !== undefined ? symbol(body.bse_code, 10) : w.bse_code ?? null;
  const [result] = await refreshPrices([{ id: w.id, ticker, bse_code: bseCode, previous_price: w.market_price ?? null }]);
  if (!result.ok) return fail(result.error, 422);
  if (result.suspicious && body.accept !== true) {
    return fail(result.suspicious, 409, { suspicious: true, price: result.price, as_of: result.as_of, source: result.source });
  }

  const update = (payload: Record<string, unknown>) => a.admin.from("sentinel_workspaces").update(payload).eq("id", w.id);
  const core = { market_price: result.price, market_price_as_of: result.as_of };
  let { error } = await update({ ...core, market_price_source: result.source, ticker, bse_code: bseCode });
  // The ticker/source columns come from a hand-run migration: save the price itself even if they are not there yet.
  if (isMissingColumn(error)) ({ error } = await update(core));
  if (error) return fail(error.message, 500);
  return NextResponse.json({ price: result.price, as_of: result.as_of, source: result.source });
}
