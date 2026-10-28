// Sentinel - the filing watcher's database half: check each company that has a BSE scrip code and store the results and
// annual-report announcements it has not seen. Shared by the daily cron and the "check now" button.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFilings } from "./filings";

export type WatchTarget = { id: string; bse_code: string | null };
export type WatchResult = { checked: number; stored: number; failed: string[]; not_set_up?: boolean };

const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

export async function watchFilings(admin: SupabaseClient, targets: WatchTarget[], deps: { now?: Date; fetchFn?: typeof fetch } = {}): Promise<WatchResult> {
  const result: WatchResult = { checked: 0, stored: 0, failed: [] };
  for (const t of targets) {
    if (!t.bse_code) continue;
    result.checked++;
    const found = await fetchFilings(t.bse_code, deps.now, 10, deps.fetchFn);
    if (!found.ok) { result.failed.push(`${t.id}: ${found.error}`); continue; }
    if (found.filings.length === 0) continue;
    const have = await admin.from("sentinel_filings").select("external_id").eq("workspace_id", t.id);
    if (have.error) {
      if (notSetUp(have.error)) return { ...result, not_set_up: true };
      result.failed.push(`${t.id}: ${have.error.message}`);
      continue;
    }
    const seen = new Set((have.data ?? []).map((r: { external_id: string }) => r.external_id));
    const fresh = found.filings.filter((f) => !seen.has(f.external_id));
    if (fresh.length === 0) continue;
    const { error } = await admin.from("sentinel_filings").insert(fresh.map((f) => ({ workspace_id: t.id, source: "bse", external_id: f.external_id, kind: f.kind, headline: f.headline, filed_at: f.filed_at, url: f.url, status: "new" })));
    // A second run racing the first hits the unique key: the rows are already there, which is the goal.
    if (error && error.code !== "23505") { result.failed.push(`${t.id}: ${error.message}`); continue; }
    result.stored += fresh.length;
  }
  return result;
}
