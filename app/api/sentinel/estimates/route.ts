// Sentinel - estimates (see lib/estimates.ts). GET lists the caller's own estimates for a company they can see (their own or a reference company);
// POST adds or replaces a batch; DELETE removes one. Estimates belong to the person who entered them: nobody else's are ever returned.

import { NextResponse } from "next/server";
import { isUuid } from "../../../sentinel/lib/access";
import { isRealDate as isDate } from "../../../sentinel/lib/requestDates";
import { ESTIMATE_METRICS, ESTIMATE_SOURCES, type EstimateMetric, type EstimateSource } from "../../../sentinel/lib/estimates";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Estimates are not set up on this database yet. Run supabase/migrations/20261108000000_sentinel_estimates.sql in the Supabase SQL editor.";
const MAX_ROWS = 200;
const publicRow = (r: Record<string, unknown>) => ({ id: r.id, period_end_date: r.period_end_date, metric: r.metric, source: r.source, source_label: r.source_label, value_cr: Number(r.value_cr), as_of: r.as_of });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const loaded = await loadWorkspaceFor(a.admin, who.userId, new URL(req.url).searchParams.get("workspace_id"), "read");
  if (isFailure(loaded)) return loaded.error;
  const { data, error } = await a.admin.from("sentinel_estimates").select("id,period_end_date,metric,source,source_label,value_cr,as_of").eq("workspace_id", loaded.workspace.id).eq("owner_id", who.userId).order("period_end_date", { ascending: false }).limit(500);
  if (error) return notSetUp(error) ? NextResponse.json({ estimates: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ estimates: (data ?? []).map(publicRow), set_up: true });
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "estimates", 30, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "read");
  if (isFailure(loaded)) return loaded.error;
  const input = Array.isArray(body.rows) ? body.rows : null;
  if (!input || input.length === 0) return fail("Send at least one estimate.", 400);
  if (input.length > MAX_ROWS) return fail(`At most ${MAX_ROWS} estimates at a time.`, 400);

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const [i, r] of (input as Record<string, unknown>[]).entries()) {
    if (!isDate(r.period_end_date)) return fail(`Estimate ${i + 1}: the period end must be a date as YYYY-MM-DD.`, 400);
    if (!(ESTIMATE_METRICS as readonly unknown[]).includes(r.metric)) return fail(`Estimate ${i + 1}: the line must be revenue, ebitda, pbt or pat.`, 400);
    if (!(ESTIMATE_SOURCES as readonly unknown[]).includes(r.source)) return fail(`Estimate ${i + 1}: the source must be consensus or own.`, 400);
    const v = typeof r.value_cr === "number" ? r.value_cr : NaN;
    if (!Number.isFinite(v) || Math.abs(v) > 1e8) return fail(`Estimate ${i + 1}: the value must be a number in rupees crore.`, 400);
    const label = typeof r.source_label === "string" ? r.source_label.trim().slice(0, 60) || null : null;
    rows.push({ workspace_id: loaded.workspace.id, owner_id: who.userId, period_end_date: r.period_end_date, metric: r.metric as EstimateMetric, source: r.source as EstimateSource, source_label: label, value_cr: v, as_of: isDate(r.as_of) ? r.as_of : now.slice(0, 10), updated_at: now });
  }
  const { error } = await a.admin.from("sentinel_estimates").upsert(rows, { onConflict: "workspace_id,owner_id,period_end_date,metric,source" });
  if (error) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error.message, 500);
  return NextResponse.json({ saved: rows.length }, { status: 201 });
}

export async function DELETE(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Say which estimate to remove.", 400);
  // Scoped to the caller: another person's estimate answers exactly like one that does not exist.
  const { data } = await a.admin.from("sentinel_estimates").select("id").eq("id", id).eq("owner_id", who.userId).maybeSingle();
  if (!data) return fail("Estimate not found.", 404);
  const { error } = await a.admin.from("sentinel_estimates").delete().eq("id", id).eq("owner_id", who.userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
