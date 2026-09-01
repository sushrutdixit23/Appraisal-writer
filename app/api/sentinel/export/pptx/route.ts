// Sentinel - Board Deck PPTX export (Export Engine Phase 2). Computes
// every figure using the exact same functions the PDF export route
// uses (buildPeerTable/computeRatios from engine.ts, computeHealthScore
// from health.ts, getBenchmark from benchmark.ts) - the KPI_DEFS list
// below is a direct copy of the PDF route's, kept in sync manually.
// Findings are condensed to a one-line headline (firstSentence) rather
// than the full narrative shown in the PDF - see board-deck.ts for why.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPeerTable, findPriorYear } from "../../../../sentinel/lib/engine";
import { getBenchmark } from "../../../../sentinel/lib/benchmark";
import { computeHealthScore } from "../../../../sentinel/lib/health";
import { getSectorConfig } from "../../../../sentinel/lib/config";
import {
  buildBoardDeck,
  type BoardDeckData,
  type BoardDeckKpi,
  type BoardDeckFinding,
} from "../../../../sentinel/lib/pptx/board-deck";
import type { FinancialStatement, Investigation, Workspace } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY!
);

const pct = (v: number | null) => (v == null ? "-" : (v * 100).toFixed(1) + "%");
const num = (v: number | null) =>
  v == null ? "-" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "-" : v.toFixed(0) + "d");
const ratioX = (v: number | null) => (v == null ? "-" : v.toFixed(2) + "x");

function gapNote(
  b: ReturnType<typeof getBenchmark>,
  unit: "pp" | "cr" | "x" | "d"
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? (b.gapToClosestPeer * 100).toFixed(1) + "pp"
      : unit === "x"
      ? b.gapToClosestPeer.toFixed(2) + "x"
      : unit === "d"
      ? b.gapToClosestPeer.toFixed(0) + "d"
      : b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " cr";
  return "vs " + b.closestPeer.company_name + ": " + sign + magnitude;
}

const KPI_DEFS: {
  label: string;
  metric: string;
  direction?: "higher_is_better" | "lower_is_better";
  unit: "pp" | "cr" | "x" | "d";
  format: (v: number | null) => string;
}[] = [
  { label: "Revenue (latest FY)", metric: "revenue_cr", unit: "cr", format: num },
  { label: "EBITDA Margin", metric: "ebitda_margin", unit: "pp", format: pct },
  { label: "PAT Margin", metric: "pat_margin", unit: "pp", format: pct },
  { label: "Revenue YoY", metric: "yoy_revenue_growth", unit: "pp", format: pct },
  { label: "PAT (latest FY)", metric: "pat_cr", unit: "cr", format: num },
  { label: "PAT YoY", metric: "yoy_pat_growth", unit: "pp", format: pct },
  { label: "Current Ratio", metric: "current_ratio", unit: "x", format: ratioX },
  {
    label: "Debt-to-Equity",
    metric: "debt_to_equity",
    direction: "lower_is_better",
    unit: "x",
    format: ratioX,
  },
  {
    label: "Inventory Days",
    metric: "inventory_days",
    direction: "lower_is_better",
    unit: "d",
    format: days,
  },
  {
    label: "Receivable Days",
    metric: "receivable_days",
    direction: "lower_is_better",
    unit: "d",
    format: days,
  },
  { label: "Payable Days", metric: "payable_days", unit: "d", format: days },
  {
    label: "Cash Conversion Cycle",
    metric: "cash_conversion_cycle",
    direction: "lower_is_better",
    unit: "d",
    format: days,
  },
];

// Takes up to maxLen chars, cutting at the first ". " if one falls
// within that window, else hard-truncating with a trailing ellipsis -
// used as a fallback for narratives with no bolded verdict line (see
// extractVerdict below) - the normal case now goes through the verdict
// instead, which is already short by the generation prompt's own design.
function firstSentence(text: string, maxLen: number): string {
  const period = text.indexOf(". ");
  if (period !== -1 && period < maxLen) {
    return text.slice(0, period + 1);
  }
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "...";
}

// The narrative generation prompt (see narrative/route.ts) always
// starts turn 2's reply with exactly one short bolded markdown verdict
// line, then a blank line, then the full analyst narrative - same
// structure Investigation Queue's parseVerdict already splits apart.
// Reimplemented here (not imported - that is a page-local helper) so
// the deck's headline is the clean verdict text, never the raw
// "**verdict**" markup or a blind mid-sentence truncation spanning
// both the verdict and the body.
function extractVerdict(narrative: string): { verdict: string | null; body: string } {
  if (!narrative.startsWith("**")) {
    return { verdict: null, body: narrative };
  }
  const closeIdx = narrative.indexOf("**", 2);
  if (closeIdx === -1) {
    return { verdict: null, body: narrative };
  }
  const verdict = narrative.slice(2, closeIdx);
  const body = narrative.slice(closeIdx + 2).trim();
  return { verdict, body };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { workspace_id, period_label } = await req.json();
  if (!workspace_id) {
    return NextResponse.json({ error: "Missing workspace_id." }, { status: 400 });
  }

  const { data: wsData, error: wsError } = await supabaseAdmin
    .from("sentinel_workspaces")
    .select("*")
    .eq("id", workspace_id)
    .single();
  if (wsError || !wsData) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }
  const workspace = wsData as Workspace;

  const { data: sectorWsData, error: sectorWsError } = await supabaseAdmin
    .from("sentinel_workspaces")
    .select("*")
    .eq("sector", workspace.sector);
  if (sectorWsError) {
    return NextResponse.json({ error: sectorWsError.message }, { status: 500 });
  }
  const sectorWorkspaces = (sectorWsData ?? []) as Workspace[];

  const { data: stmtData, error: stmtError } = await supabaseAdmin
    .from("sentinel_statements")
    .select("*")
    .in(
      "workspace_id",
      sectorWorkspaces.map((w) => w.id)
    );
  if (stmtError) {
    return NextResponse.json({ error: stmtError.message }, { status: 500 });
  }
  const statements = (stmtData ?? []) as FinancialStatement[];

  const ownFYStatements = statements
    .filter((s) => s.workspace_id === workspace_id && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  if (ownFYStatements.length === 0) {
    return NextResponse.json(
      { error: "No annual statements on file for this company yet." },
      { status: 404 }
    );
  }
  const latestStmt = period_label
    ? ownFYStatements.find((s) => s.period_label === period_label) ??
      ownFYStatements[ownFYStatements.length - 1]
    : ownFYStatements[ownFYStatements.length - 1];
  const priorStmt = findPriorYear(latestStmt, statements);

  const peerRows = buildPeerTable(sectorWorkspaces, statements, workspace_id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;

  const kpis: BoardDeckKpi[] = KPI_DEFS.map((d) => {
    const benchmark = getBenchmark(peerRows, workspace_id, d.metric, d.direction ?? "higher_is_better");
    const rawValue =
      d.metric === "revenue_cr" || d.metric === "pat_cr" || d.metric === "pbt_cr"
        ? (selfRow?.[d.metric as "revenue_cr" | "pat_cr" | "pbt_cr"] ?? null)
        : (selfRow?.ratios[d.metric] ?? null);
    return {
      label: d.label,
      value: d.format(rawValue),
      note: gapNote(benchmark, d.unit),
    };
  });

  const health = computeHealthScore(latestStmt, priorStmt, workspace.sector);
  const healthForDeck = {
    overall: health.overall,
    categories: health.categories.map((c) => ({ label: c.label, status: c.status })),
  };

  const { data: invData, error: invError } = await supabaseAdmin
    .from("sentinel_investigations")
    .select("*")
    .eq("workspace_id", workspace_id);
  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 });
  }
  const allInvestigations = (invData ?? []) as Investigation[];
  const statusRank: Record<string, number> = { approved: 0, edited: 0, pending: 1 };
  const findings: BoardDeckFinding[] = allInvestigations
    .filter((i) => i.status === "approved" || i.status === "edited" || i.status === "pending")
    .sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    })
    .slice(0, 3)
    .map((inv) => {
      const narrative =
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.";
      const { verdict, body } = extractVerdict(narrative);
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        headline: verdict ?? firstSentence(body, 160),
        confidenceScore: inv.confidence_score,
      };
    });

  const sectorCfg = getSectorConfig(workspace.sector);

  const deckData: BoardDeckData = {
    companyName: workspace.company_name,
    sectorLabel: sectorCfg.display_name,
    periodLabel: latestStmt.period_label,
    basis: latestStmt.basis,
    generatedAt: new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    kpis,
    health: healthForDeck,
    findings,
  };

  try {
    const buffer = await buildBoardDeck(deckData);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition":
          "attachment; filename=\"" +
          workspace.company_name.replace(/\s+/g, "_") +
          "_Board_Deck_" +
          latestStmt.period_label +
          ".pptx\"",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PPTX generation failed." },
      { status: 502 }
    );
  }
}
