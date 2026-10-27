// Sentinel - server-side helpers shared by the API routes: the admin
// database client, who is calling, whether they may touch the company they
// named, and the peer set that is safe to build around it.
//
// Server only. Never import this from a "use client" page.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { accessLevel, isUuid, readableWorkspaceFilter } from "./access";
import { buildPeerTable, findPriorYear } from "./engine";
import type { FinancialStatement, Investigation, PeerRow, Workspace } from "./types";

type Failure = { error: NextResponse };

/** The service key is stored under two names across this codebase; accept either. */
export function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || undefined;
}

export function getAdmin(): { admin: SupabaseClient } | Failure {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) {
    return {
      error: NextResponse.json(
        { error: "Server misconfiguration: the Supabase URL or service key is not set." },
        { status: 500 }
      ),
    };
  }
  return { admin: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

/** Who is calling. The token must be a real session for a real user. */
export async function authenticate(
  req: Request,
  admin: SupabaseClient
): Promise<{ userId: string } | Failure> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Invalid session." }, { status: 401 }) };
  return { userId: data.user.id };
}

/** Load the company the caller named, only if they may use it the way they intend. A company they
 * cannot see answers exactly like one that does not exist. */
export async function loadWorkspaceFor(
  admin: SupabaseClient,
  userId: string,
  workspaceId: unknown,
  need: "read" | "write"
): Promise<{ workspace: Workspace } | Failure> {
  const notFound = { error: NextResponse.json({ error: "Workspace not found." }, { status: 404 }) };
  if (!isUuid(workspaceId)) return notFound;
  const { data, error } = await admin.from("sentinel_workspaces").select("*").eq("id", workspaceId).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return notFound;
  const workspace = data as Workspace;
  const level = accessLevel(workspace, userId);
  if (level === "none") return notFound;
  if (need === "write" && level !== "write") {
    return {
      error: NextResponse.json(
        { error: "This company is a read-only reference company. Only a company you created can be changed." },
        { status: 403 }
      ),
    };
  }
  return { workspace };
}

/** The same-sector companies the caller is allowed to see (reference companies plus their own),
 * and every statement of those. Anything else on the platform stays out of the peer set, the
 * generated narrative and the exports. */
export async function loadPeerContext(
  admin: SupabaseClient,
  userId: string,
  workspace: Workspace
): Promise<{ workspaces: Workspace[]; statements: FinancialStatement[] } | Failure> {
  const { data: wsData, error: wsError } = await admin
    .from("sentinel_workspaces")
    .select("*")
    .eq("sector", workspace.sector)
    .or(readableWorkspaceFilter(userId));
  if (wsError) return { error: NextResponse.json({ error: wsError.message }, { status: 500 }) };
  const workspaces = (wsData ?? []) as Workspace[];
  // The company itself is always part of its own picture, even if the filter somehow missed it.
  if (!workspaces.some((w) => w.id === workspace.id)) workspaces.push(workspace);

  const { data: stmtData, error: stmtError } = await admin
    .from("sentinel_statements")
    .select("*")
    .in("workspace_id", workspaces.map((w) => w.id));
  if (stmtError) return { error: NextResponse.json({ error: stmtError.message }, { status: 500 }) };
  return { workspaces, statements: (stmtData ?? []) as FinancialStatement[] };
}

/** A file name that cannot break a Content-Disposition header, whatever the company is called. */
export function safeFilename(name: string, fallback = "company"): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function isFailure<T extends object>(v: T | Failure): v is Failure {
  return "error" in v && (v as Failure).error instanceof Response;
}

export type ExportContext = {
  userId: string;
  workspace: Workspace;
  sectorWorkspaces: Workspace[];
  statements: FinancialStatement[];
  /** This company's annual statements, oldest first. */
  ownFY: FinancialStatement[];
  /** The annual statement the peer table and the KPI figures are built from. */
  latestStmt: FinancialStatement;
  priorStmt: FinancialStatement | null;
  peerRows: PeerRow[];
  selfRow: PeerRow | null;
  /** The CALLER'S investigations on this company - never other users' drafts. */
  investigations: Investigation[];
};

/** Everything the PDF, PowerPoint and Excel exports start from: who is calling, that they may read
 * the company, the peer set they are allowed to see, and the statement the figures come from. */
export async function loadExportContext(
  req: Request,
  opts: { investigations?: boolean } = {}
): Promise<ExportContext | Failure> {
  const a = getAdmin();
  if (isFailure(a)) return a;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who;

  let body: { workspace_id?: unknown; period_label?: unknown };
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 }) };
  }
  if (!body.workspace_id) {
    return { error: NextResponse.json({ error: "Missing workspace_id." }, { status: 400 }) };
  }

  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "read");
  if (isFailure(loaded)) return loaded;
  const workspace = loaded.workspace;
  const context = await loadPeerContext(a.admin, who.userId, workspace);
  if (isFailure(context)) return context;
  const { workspaces: sectorWorkspaces, statements } = context;

  const ownFY = statements
    .filter((s) => s.workspace_id === workspace.id && s.period_type === "FY")
    .sort((x, y) => x.period_end_date.localeCompare(y.period_end_date));
  if (ownFY.length === 0) {
    return { error: NextResponse.json({ error: "No annual statements on file for this company yet." }, { status: 404 }) };
  }

  const peerRows = buildPeerTable(sectorWorkspaces, statements, workspace.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;
  // The statement behind the figures: the one the peer table picked (latest year, on the company's
  // own basis), so the KPI tiles, the health score and the statement table can never describe
  // different periods.
  const latestStmt =
    ownFY.find((s) => selfRow && s.period_label === selfRow.period_label && s.basis === selfRow.basis) ??
    ownFY[ownFY.length - 1];
  if (typeof body.period_label === "string" && body.period_label && body.period_label !== latestStmt.period_label) {
    return {
      error: NextResponse.json(
        { error: `Exports cover the latest annual period (${latestStmt.period_label}); ${body.period_label} is not available.` },
        { status: 400 }
      ),
    };
  }
  const priorStmt = findPriorYear(latestStmt, statements);

  let investigations: Investigation[] = [];
  if (opts.investigations) {
    const { data, error } = await a.admin
      .from("sentinel_investigations")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("owner_id", who.userId);
    if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
    investigations = (data ?? []) as Investigation[];
  }

  return { userId: who.userId, workspace, sectorWorkspaces, statements, ownFY, latestStmt, priorStmt, peerRows, selfRow, investigations };
}
