// Sentinel — MIS Pack PDF export (Export Engine Phase 1). Computes
// every figure using the exact same functions the app itself uses
// (buildPeerTable/computeRatios from engine.ts, computeHealthScore from
// health.ts, getBenchmark from benchmark.ts) rather than recomputing
// anything separately, so the PDF can never show a number the app
// wouldn't also show. Renders server-side via @react-pdf/renderer and
// streams back as a binary attachment - the client fetches this with
// its own auth header and triggers the download from the resulting
// blob (same pattern as the existing CSV export on Financial
// Statements), since a plain <a href> link can't carry an
// Authorization header.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { isFailure, loadExportContext, safeFilename } from "../../../../sentinel/lib/server";
import { getBenchmark } from "../../../../sentinel/lib/benchmark";
import { computeHealthScore } from "../../../../sentinel/lib/health";
import { getSectorConfig } from "../../../../sentinel/lib/config";
import type { DisplayFormat } from "../../../../sentinel/lib/displayUnitCore";
import {
  MisPackDocument,
  type MisPackData,
  type MisPackKpi,
  type MisPackStatementRow,
  type MisPackInvestigation,
} from "../../../../sentinel/lib/pdf/mis-pack";
import type { FinancialStatement, Investigation, Workspace } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";

// Same 12 metrics and formatting convention as the KPI Dashboard's
// page.tsx, deliberately duplicated here rather than imported (those
// formatters are page-local) - keep both in sync if either changes.
// The PDF's built-in font has no rupee glyph (it prints as a superscript 1), so units are spelled "Rs" here.
const plain = (label: string) => label.replace(/\u20b9/g, "Rs");

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}d`);
const ratioX = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}x`);

function gapNote(
  b: ReturnType<typeof getBenchmark>,
  unit: "pp" | "cr" | "x" | "d",
  du: DisplayFormat
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${du.fromCrore(b.gapToClosestPeer).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${du.crossShort}`.trim();
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}

// The narrative generation prompt (see narrative/route.ts) always
// starts turn 2's reply with exactly one short bolded markdown verdict
// line, then a blank line, then the full analyst narrative - same
// structure Investigation Queue's parseVerdict already splits apart,
// and the same plain-string implementation used in the PPTX export
// route (no regex, no backslash-escaping surface for this to break on).
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

// Same 8 Income Statement line items as Financial Statements' own row
// list (a subset - drops the smaller indent-only lines to keep the PDF
// to one readable table).
const STATEMENT_ROWS: { label: string; key: keyof FinancialStatement; bold?: boolean }[] = [
  { label: "Revenue from Operations", key: "revenue_from_operations", bold: true },
  { label: "Total Expenses", key: "total_expenses" },
  { label: "EBITDA", key: "ebitda", bold: true },
  { label: "Depreciation & Amortisation", key: "depreciation_amortisation" },
  { label: "Finance Costs", key: "finance_costs" },
  { label: "Profit Before Tax", key: "profit_before_tax", bold: true },
  { label: "Tax Expense", key: "tax_expense" },
  { label: "Profit After Tax", key: "profit_after_tax", bold: true },
];

export async function POST(req: Request) {
  const ctx = await loadExportContext(req, { investigations: true });
  if (isFailure(ctx)) return ctx.error;
  const { workspace, ownFY: ownFYStatements, latestStmt, priorStmt, peerRows, selfRow, display: du } = ctx;
  const workspace_id = workspace.id;

  const kpis: MisPackKpi[] = KPI_DEFS.map((d) => {
    const benchmark = getBenchmark(peerRows, workspace_id, d.metric, d.direction ?? "higher_is_better");
    const rawValue =
      d.metric === "revenue_cr" || d.metric === "pat_cr" || d.metric === "pbt_cr"
        ? (selfRow?.[d.metric as "revenue_cr" | "pat_cr" | "pbt_cr"] ?? null)
        : (selfRow?.ratios[d.metric] ?? null);
    // Peer-table amounts are held in crore; the pack shows them in the chosen unit and names it in the label.
    const isAmount = d.unit === "cr";
    return {
      label: isAmount ? `${d.label}, ${plain(du.crossLabel)}` : d.label,
      value: d.format(isAmount && rawValue != null ? du.fromCrore(rawValue) : rawValue),
      note: gapNote(benchmark, d.unit, du),
    };
  });

  const health = computeHealthScore(latestStmt, priorStmt, workspace.sector, workspace.currency_unit);
  const healthForPdf = {
    overall: health.overall,
    categories: health.categories.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
  };

  const recentStatements = ownFYStatements.slice(-3);
  const statementRows: MisPackStatementRow[] = STATEMENT_ROWS.map((row) => ({
    label: row.label,
    bold: row.bold,
    values: recentStatements.map((s) => {
      const v = s[row.key] as number | null;
      return v == null
        ? null
        : du.fromCompany(v, workspace.currency_unit).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }),
  }));

  // Key Investigations — approved/edited first (reviewed, most
  // defensible to show an executive), then pending, ranked by
  // confidence within each group; rejected and archived excluded. Top 5.
  const allInvestigations = ctx.investigations;
  const statusRank: Record<string, number> = { approved: 0, edited: 0, pending: 1 };
  const investigations: MisPackInvestigation[] = allInvestigations
    .filter((i) => i.status === "approved" || i.status === "edited" || i.status === "pending")
    .sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    })
    .slice(0, 5)
    .map((inv) => {
      const rawNarrative =
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.";
      const { verdict, body } = extractVerdict(rawNarrative);
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        confidenceScore: inv.confidence_score,
        namedPeer: inv.named_peer,
        verdict,
        narrative: body,
      };
    });

  const sectorCfg = getSectorConfig(workspace.sector);

  const pdfData: MisPackData = {
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
    health: healthForPdf,
    periodLabels: recentStatements.map((s) => s.period_label),
    statementUnit: plain(du.ownLabel(workspace.currency_unit)),
    statementRows,
    investigations,
  };

  try {
    const buffer = await renderToBuffer(MisPackDocument({ data: pdfData }));
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(workspace.company_name)}_MIS_Pack_${safeFilename(latestStmt.period_label, "FY")}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF generation failed." },
      { status: 502 }
    );
  }
}
