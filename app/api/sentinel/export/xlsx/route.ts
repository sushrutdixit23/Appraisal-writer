// Sentinel - Excel statement export (Export Engine Phase 3). Reuses
// the same peer/statement fetching as the PDF and PPTX export routes.
// Unlike those two, this exports ALL FY periods on file (not just the
// last few) since a spreadsheet has no page-width constraint the way a
// PDF or slide does.

import { NextResponse } from "next/server";
import { findPriorYear } from "../../../../sentinel/lib/engine";
import { isFailure, loadExportContext, safeFilename } from "../../../../sentinel/lib/server";
import { getBenchmark } from "../../../../sentinel/lib/benchmark";
import type { DisplayFormat } from "../../../../sentinel/lib/displayUnitCore";
import {
  buildStatementWorkbook,
  type StatementExportData,
  type StatementExportPeerNote,
  type StatementExportPeriod,
} from "../../../../sentinel/lib/excel/statement-export";

export const runtime = "nodejs";

function formatVsPeer(
  b: ReturnType<typeof getBenchmark>,
  isRatio: boolean,
  du: DisplayFormat
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? sign + (b.gapToClosestPeer * 100).toFixed(1) + "pp"
    : (sign + du.fromCrore(b.gapToClosestPeer).toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " " + du.crossShort).trim();
  return gap + " vs " + b.closestPeer.company_name;
}

export async function POST(req: Request) {
  const ctx = await loadExportContext(req);
  if (isFailure(ctx)) return ctx.error;
  const { workspace, statements, ownFY: ownFYStatements, peerRows, display: du } = ctx;
  const workspace_id = workspace.id;

  const periods: StatementExportPeriod[] = ownFYStatements.map((s) => ({
    label: s.period_label,
    basis: s.basis,
    values: Object.fromEntries(
      (
        [
          "revenue_from_operations", "other_income", "total_income", "total_expenses", "ebitda", "depreciation_amortisation",
          "finance_costs", "exceptional_items", "profit_before_tax", "tax_expense", "profit_after_tax",
        ] as const
      ).map((k) => [k, s[k] == null ? null : Number(du.fromCompany(s[k] as number, workspace.currency_unit).toPrecision(12))])
    ) as Record<string, number | null>,
  }));

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
      const note = formatVsPeer(benchmark, d.isRatio, du);
      if (note) peerNotes.push({ rowKey: d.rowKey, note });
    }
  }

  // The YoY column compares the last two columns, which is only a year-on-year comparison when the
  // second-to-last column really is the prior year on the same basis. Otherwise it is left out
  // rather than shown under a label it does not earn.
  const latest = ownFYStatements[ownFYStatements.length - 1];
  const prior = findPriorYear(latest, statements);
  const yoyComparable =
    ownFYStatements.length >= 2 && prior != null && prior.id === ownFYStatements[ownFYStatements.length - 2].id;

  const exportData: StatementExportData = {
    companyName: workspace.company_name,
    currencyUnit: du.ownLabel(workspace.currency_unit),
    periods,
    peerNotes,
    yoyComparable,
  };

  try {
    const buffer = await buildStatementWorkbook(exportData);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="' +
          safeFilename(workspace.company_name) +
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
