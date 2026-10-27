// Sentinel - operating metrics endpoint: record or remove one metric for a company the caller owns. Same rules as
// the statement route (service-role key, so ownership is checked here; a public reference company is read-only).
// Before the database migration is applied the table does not exist: that answers 503 with a plain message.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMetricInput } from "../../../sentinel/lib/metrics";
import type { Workspace } from "../../../sentinel/lib/types";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEEDS_MIGRATION = "Operating metrics need a database step first (supabase/migrations/20261030000000_sentinel_operating_metrics.sql).";
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

async function context(req: Request): Promise<{ ok: false; error: NextResponse } | { ok: true; admin: SupabaseClient; userId: string; workspace: Workspace; body: Record<string, unknown> }> {
  const a = getAdmin();
  if (isFailure(a)) return { ok: false, error: a.error };
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return { ok: false, error: who.error };
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return { ok: false, error: fail("The request body is not valid JSON.", 400) };
  }
  if (!body || typeof body !== "object") return { ok: false, error: fail("Missing payload.", 400) };
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return { ok: false, error: loaded.error };
  return { ok: true, admin: a.admin, userId: who.userId, workspace: loaded.workspace, body };
}

export async function POST(req: Request) {
  const c = await context(req);
  if (!c.ok) return c.error;
  const parsed = parseMetricInput(c.body);
  if (!parsed.ok) return fail(parsed.error, 422);
  const { error } = await c.admin.from("sentinel_operating_metrics").upsert(
    { workspace_id: c.workspace.id, ...parsed.row, created_by: c.userId, updated_at: new Date().toISOString() },
    { onConflict: "workspace_id,period_label,metric" }
  );
  if (error) return missingTable(error.code) ? fail(NEEDS_MIGRATION, 503) : fail(error.message, 500);
  return NextResponse.json({ status: "saved" });
}

export async function DELETE(req: Request) {
  const c = await context(req);
  if (!c.ok) return c.error;
  const period = typeof c.body.period_label === "string" ? c.body.period_label : "";
  const metric = typeof c.body.metric === "string" ? c.body.metric : "";
  if (!period || !metric) return fail("Give the period_label and metric to remove.", 400);
  const { error } = await c.admin.from("sentinel_operating_metrics").delete().eq("workspace_id", c.workspace.id).eq("period_label", period).eq("metric", metric);
  if (error) return missingTable(error.code) ? fail(NEEDS_MIGRATION, 503) : fail(error.message, 500);
  return NextResponse.json({ status: "removed" });
}
