// Sentinel - covenants (see lib/covenants.ts). GET lists the caller's own covenants for a company; POST adds one, or replaces one when `id` is sent;
// DELETE removes one. Only a company the caller created can carry covenants, and nobody else's are ever returned.

import { NextResponse } from "next/server";
import { isUuid } from "../../../sentinel/lib/access";
import { validateCovenant } from "../../../sentinel/lib/covenants";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Covenants are not set up on this database yet. Run supabase/migrations/20261111000000_sentinel_covenants.sql in the Supabase SQL editor.";
const MAX_PER_COMPANY = 30;
const COLUMNS = "id,workspace_id,name,metric,comparator,limit_value,next_test_date,notes";
const publicRow = (r: Record<string, unknown>) => ({ id: r.id, workspace_id: r.workspace_id, name: r.name, metric: r.metric, comparator: r.comparator, limit_value: Number(r.limit_value), next_test_date: r.next_test_date ?? null, notes: r.notes ?? null });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const loaded = await loadWorkspaceFor(a.admin, who.userId, new URL(req.url).searchParams.get("workspace_id"), "read");
  if (isFailure(loaded)) return loaded.error;
  const { data, error } = await a.admin.from("sentinel_covenants").select(COLUMNS).eq("workspace_id", loaded.workspace.id).eq("owner_id", who.userId).order("created_at", { ascending: true }).limit(100);
  if (error) return notSetUp(error) ? NextResponse.json({ covenants: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ covenants: (data ?? []).map(publicRow), set_up: true });
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "covenants", 40, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  const v = validateCovenant(body);
  if (!v.ok) return fail(v.error, 400);
  const now = new Date().toISOString();

  if (body.id !== undefined) {
    if (!isUuid(body.id)) return fail("Say which covenant to change.", 400);
    const { data: existing } = await a.admin.from("sentinel_covenants").select("id").eq("id", body.id).eq("owner_id", who.userId).eq("workspace_id", loaded.workspace.id).maybeSingle();
    if (!existing) return fail("Covenant not found.", 404);
    const { error } = await a.admin.from("sentinel_covenants").update({ ...v.row, updated_at: now }).eq("id", body.id).eq("owner_id", who.userId);
    if (error) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error.message, 500);
    return NextResponse.json({ saved: 1 });
  }

  const { data: current, error: countError } = await a.admin.from("sentinel_covenants").select("id").eq("workspace_id", loaded.workspace.id).eq("owner_id", who.userId);
  if (countError) return notSetUp(countError) ? fail(NOT_SET_UP, 501) : fail(countError.message, 500);
  if ((current ?? []).length >= MAX_PER_COMPANY) return fail(`At most ${MAX_PER_COMPANY} covenants per company.`, 400);
  const { error } = await a.admin.from("sentinel_covenants").insert({ workspace_id: loaded.workspace.id, owner_id: who.userId, ...v.row, updated_at: now });
  if (error) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error.message, 500);
  return NextResponse.json({ saved: 1 }, { status: 201 });
}

export async function DELETE(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Say which covenant to remove.", 400);
  // Scoped to the caller: another person's covenant answers exactly like one that does not exist.
  const { data } = await a.admin.from("sentinel_covenants").select("id").eq("id", id).eq("owner_id", who.userId).maybeSingle();
  if (!data) return fail("Covenant not found.", 404);
  const { error } = await a.admin.from("sentinel_covenants").delete().eq("id", id).eq("owner_id", who.userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
