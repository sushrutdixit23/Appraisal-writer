// Sentinel - look for new results and annual-report filings of every company that has a BSE scrip code. Runs daily
// (vercel.json); the digest then lists what it stored. A refusal or an unreadable reply from BSE is reported in this
// route's response, per company, so the first scheduled run shows whether the feed is reachable from the host.

import { NextResponse } from "next/server";
import { cronAuthorised, cronRefusal } from "../../../../sentinel/lib/cron";
import { watchFilings } from "../../../../sentinel/lib/filingWatch";
import { getAdmin, isFailure } from "../../../../sentinel/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return cronRefusal();
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const { data, error } = await a.admin.from("sentinel_workspaces").select("id,bse_code,owner_id,is_public_reference");
  if (error) return NextResponse.json({ checked: 0, stored: 0, note: "No BSE codes are stored yet (run the market-feed migration)." });
  // Reference companies are context, not coverage: only companies someone owns are watched.
  const targets = (data ?? []).filter((w) => w.bse_code && w.owner_id && !w.is_public_reference).map((w) => ({ id: w.id as string, bse_code: w.bse_code as string }));
  return NextResponse.json(await watchFilings(a.admin, targets));
}
