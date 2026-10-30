// Sentinel - holdings (see lib/portfolio.ts). GET lists the caller's own holdings; POST saves one holding (one row per person and company, replaced when it already
// exists) or imports a broker CSV matched to the projects the caller can read; DELETE removes one. A holding is private to the person who entered it: the table is
// closed to the browser and every query here is scoped to the caller. The company may be the caller's own project or a reference company (read access is enough:
// owning a share of a company does not mean having created it).

import { NextResponse } from "next/server";
import { isUuid, readableWorkspaceFilter } from "../../../sentinel/lib/access";
import { parseHoldingsCsv, validateHolding } from "../../../sentinel/lib/portfolio";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";
import type { Workspace } from "../../../sentinel/lib/types";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Holdings are not set up on this database yet. Run supabase/migrations/20261113000000_sentinel_holdings.sql in the Supabase SQL editor.";
const MAX_HOLDINGS = 300;
const MAX_CSV_CHARS = 200_000;
const COLUMNS = "id,workspace_id,quantity,avg_cost,notes";
const publicRow = (r: Record<string, unknown>) => ({ id: r.id, workspace_id: r.workspace_id, quantity: Number(r.quantity), avg_cost: r.avg_cost == null ? null : Number(r.avg_cost), notes: r.notes ?? null });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const { data, error } = await a.admin.from("sentinel_holdings").select(COLUMNS).eq("owner_id", who.userId).order("created_at", { ascending: true }).limit(MAX_HOLDINGS);
  if (error) return notSetUp(error) ? NextResponse.json({ holdings: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ holdings: (data ?? []).map(publicRow), set_up: true });
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "holdings", 40, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const now = new Date().toISOString();

  const { data: current, error: currentError } = await a.admin.from("sentinel_holdings").select("id,workspace_id").eq("owner_id", who.userId);
  if (currentError) return notSetUp(currentError) ? fail(NOT_SET_UP, 501) : fail(currentError.message, 500);
  const existing = new Map((current ?? []).map((r: { id: string; workspace_id: string }) => [r.workspace_id, r.id]));

  // A broker export: every row is matched to a project the caller can read; the rest are returned with the reason.
  if (typeof body.csv === "string") {
    if (body.csv.length > MAX_CSV_CHARS) return fail("That file is too large to be a list of holdings.", 413);
    const { data: ws, error: wsError } = await a.admin.from("sentinel_workspaces").select("*").or(readableWorkspaceFilter(who.userId));
    if (wsError) return fail(wsError.message, 500);
    const parsed = parseHoldingsCsv(body.csv, (ws ?? []) as Workspace[]);
    if (parsed.errors.length) return fail(parsed.errors.join(" "), 400);
    const adds = parsed.matched.filter((m) => !existing.has(m.workspace_id)).length;
    if (existing.size + adds > MAX_HOLDINGS) return fail(`At most ${MAX_HOLDINGS} holdings.`, 400);
    for (const m of parsed.matched) {
      const row = { quantity: m.quantity, avg_cost: m.avg_cost, updated_at: now };
      const id = existing.get(m.workspace_id);
      const { error } = id
        ? await a.admin.from("sentinel_holdings").update(row).eq("id", id).eq("owner_id", who.userId)
        : await a.admin.from("sentinel_holdings").insert({ owner_id: who.userId, workspace_id: m.workspace_id, ...row });
      if (error) return fail(error.message, 500);
    }
    // "replace": the file is the whole book, so a holding it does not mention has been sold.
    let removed = 0;
    if (body.replace === true && parsed.matched.length > 0) {
      const keep = new Set(parsed.matched.map((m) => m.workspace_id));
      for (const [workspaceId, id] of existing) {
        if (keep.has(workspaceId)) continue;
        const { error } = await a.admin.from("sentinel_holdings").delete().eq("id", id).eq("owner_id", who.userId);
        if (error) return fail(error.message, 500);
        removed++;
      }
    }
    return NextResponse.json({ saved: parsed.matched.length, removed, unmatched: parsed.unmatched, matched: parsed.matched.map((m) => m.company_name) });
  }

  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "read");
  if (isFailure(loaded)) return loaded.error;
  const v = validateHolding({ ...body, workspace_id: loaded.workspace.id });
  if (!v.ok) return fail(v.error, 400);
  const id = existing.get(loaded.workspace.id);
  if (!id && existing.size >= MAX_HOLDINGS) return fail(`At most ${MAX_HOLDINGS} holdings.`, 400);
  const row = { quantity: v.row.quantity, avg_cost: v.row.avg_cost, notes: v.row.notes ?? null, updated_at: now };
  const { error } = id
    ? await a.admin.from("sentinel_holdings").update(row).eq("id", id).eq("owner_id", who.userId)
    : await a.admin.from("sentinel_holdings").insert({ owner_id: who.userId, workspace_id: loaded.workspace.id, ...row });
  if (error) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error.message, 500);
  return NextResponse.json({ saved: 1 }, { status: id ? 200 : 201 });
}

export async function DELETE(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Say which holding to remove.", 400);
  // Scoped to the caller: another person's holding answers exactly like one that does not exist.
  const { data } = await a.admin.from("sentinel_holdings").select("id").eq("id", id).eq("owner_id", who.userId).maybeSingle();
  if (!data) return fail("Holding not found.", 404);
  const { error } = await a.admin.from("sentinel_holdings").delete().eq("id", id).eq("owner_id", who.userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
