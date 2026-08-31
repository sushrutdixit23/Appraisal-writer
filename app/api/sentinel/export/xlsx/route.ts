// Sentinel - Excel statement export (Export Engine Phase 3). Reuses
// the same peer/statement fetching as the PDF and PPTX export routes.
// Unlike those two, this exports ALL FY periods on file (not just the
// last few) since a spreadsheet has no page-width constraint the way a
// PDF or slide does.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPeerTable } from "../../../../sentinel/lib/engine";
import { getBenchmark } from "../../../../sentinel/lib/benchmark";
import {
  buildStatementWorkbook,
  type StatementExportData,
  type StatementExportPeerNote,
  type StatementExportPeriod,
} from "../../../../sentinel/lib/excel/statement-export";
import type { FinancialStatement, Workspace } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY!
);

function formatVsPeer(
  b: ReturnType<typeof getBenchmark>,
  isRatio: boolean
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? sign + (b.gapToClosestPeer * 100).toFixed(1) + "pp"
    : sign + b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return gap + " vs " + b.closestPeer.company_name;
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

  const { workspace_id } = await req.json();
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

  const periods: StatementExportPeriod[] = ownFYStatements.map((s) => ({
    label: s.period_label,
    basis: s.basis,
    values: {
      revenue_from_operations: s.revenue_from_operations,
      other_income: s.other_income,
      total_income: s.total_income,
      total_expenses: s.total_expenses,
      ebitda: s.ebitda,
      depreciation_amortisation: s.depreciation_amortisation,
      finance_costs: s.finance_costs,
      exceptional_items: s.exceptional_items,
      profit_before_tax: s.profit_before_tax,
      tax_expense: s.tax_expense,
      profit_after_tax: s.profit_after_tax,
    },
  }));

  const peerRows = buildPeerTable(sectorWorkspaces, statements, workspace_id, "FY");
  const peerNotes: StatementExportPeerNote[] = [];
  const peerDefs: { rowKey: string; metric: string; isRatio: boolean }[] = [
    { rowKey: "revenue_from_operations", metric: "revenue_cr", isRatio: false },
    { rowKey: "profit_before_tax", metric: "pbt_cr", isRatio: false },
    { rowKey: "profit_after_tax", metric: "pat_cr", isRatio: false },
    { rowKey: "ebitda_margin", metric: "ebitda_margin", isRatio: true },
    { rowKey: "pat_margin", metric: "pat_margin", isRatio: true },
  ];
  if (peerRows.length > 1) {
    for (const d of peerDefs) {
      const benchmark = getBenchmark(peerRows, workspace_id, d.metric);
      const note = formatVsPeer(benchmark, d.isRatio);
      if (note) peerNotes.push({ rowKey: d.rowKey, note });
    }
  }

  const exportData: StatementExportData = {
    companyName: workspace.company_name,
    currencyUnit: workspace.currency_unit,
    periods,
    peerNotes,
  };

  try {
    const buffer = await buildStatementWorkbook(exportData);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="' +
          workspace.company_name.replace(/\s+/g, "_") +
          '_Income_Statement.xlsx"',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Excel generation failed." },
      { status: 502 }
    );
  }
}
