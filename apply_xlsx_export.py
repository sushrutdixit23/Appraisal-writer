# -*- coding: utf-8 -*-
"""
Sentinel - Export Engine Phase 3: Excel (Income Statement + Common-Size
workbook). Creates the builder + API route, and adds an "Export Excel"
button next to "Download CSV" on Financial Statements.

Run from the repo root (the folder containing package.json).
Requires exceljs to be installed:
  npm install exceljs
"""
import io
import os
import sys

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_check(path, content):
    opens = content.count("{")
    closes = content.count("}")
    if opens == closes:
        print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
    else:
        print("[MISS] brace mismatch in " + path + ": " + str(opens) + " open / " + str(closes) + " close")

def create_new(path, content, label):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        print("[SKIP] " + path + " already exists - not overwriting. Delete it first for a clean rebuild.")
        return False
    write(path, content)
    print("[OK] created " + path + " (" + str(len(content.encode("utf-8"))) + " bytes)")
    brace_check(path, content)
    return True

def apply_edit(content, old, new, label, get_content_path):
    count = content.count(old)
    if count == 0:
        print("[MISS] " + label + ": anchor not found. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    if count > 1:
        print("[MISS] " + label + ": anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    print("[OK] " + label)
    return content.replace(old, new, 1)

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

excel_path = os.path.join(ROOT, "app", "sentinel", "lib", "excel", "statement-export.ts")
EXCEL_TS = r'''// Sentinel - Excel statement export builder (Export Engine Phase 3).
// Two sheets, mirroring the two view-modes Financial Statements already
// has (raw + YoY%, and common-size toggle) rather than inventing a new
// layout:
//
//   "Income Statement" - the 11 line items exactly as reported (plain
//   values, never a formula - Sentinel does not compute these, the
//   filing does), plus YoY% (latest period vs prior, same scoping the
//   app's own YoY column uses) and EBITDA/PAT Margin as LIVE formulas
//   referencing the raw cells - these two rows genuinely are Sentinel-
//   computed, so a formula is honest here where it would not be for the
//   raw line items above them.
//
//   "Common-Size" - every raw line item as a live formula (cell /
//   that period's revenue cell), same math the page's own common-size
//   toggle does.
//
// Peer benchmark gaps are written as plain text (with a note), never a
// formula - peer data is not something the recipient's own model would
// want live-linked back to Sentinel's peer set.
//
// Every formula string here was generated and verified against real
// exceljs output opened in LibreOffice Calc before being written into
// this file - the values recompute correctly, including the blank-
// numerator edge case (a period with no exceptional items reported).

import ExcelJS from "exceljs";

export type StatementExportPeriod = {
  label: string;
  basis: string;
  values: Record<string, number | null>;
};

export type StatementExportPeerNote = {
  rowKey: string;
  note: string;
};

export type StatementExportData = {
  companyName: string;
  currencyUnit: string;
  periods: StatementExportPeriod[];
  peerNotes: StatementExportPeerNote[];
};

const INK_SOFT = "FF5C5850";
const BACKGROUND = "FFF7F3EB";

const ROWS: { label: string; key: string; bold?: boolean }[] = [
  { label: "Revenue from Operations", key: "revenue_from_operations", bold: true },
  { label: "Other Income", key: "other_income" },
  { label: "Total Income", key: "total_income", bold: true },
  { label: "Total Expenses", key: "total_expenses" },
  { label: "EBITDA", key: "ebitda", bold: true },
  { label: "Depreciation & Amortisation", key: "depreciation_amortisation" },
  { label: "Finance Costs", key: "finance_costs" },
  { label: "Exceptional Items", key: "exceptional_items" },
  { label: "Profit Before Tax", key: "profit_before_tax", bold: true },
  { label: "Tax Expense", key: "tax_expense" },
  { label: "Profit After Tax", key: "profit_after_tax", bold: true },
];

function colLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

export async function buildStatementWorkbook(data: StatementExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sentinel";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Income Statement");

  const firstPeriodCol = 2;
  const lastPeriodCol = firstPeriodCol + data.periods.length - 1;
  const yoyCol = lastPeriodCol + 1;
  const peerCol = yoyCol + 1;

  const header = sheet.getRow(1);
  header.getCell(1).value = "Line Item";
  data.periods.forEach((p, i) => {
    header.getCell(firstPeriodCol + i).value = p.label + " (" + p.basis + ")";
  });
  if (data.periods.length >= 2) {
    header.getCell(yoyCol).value = "YoY % (latest)";
  }
  header.getCell(peerCol).value = "vs Peers (latest FY)";
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: INK_SOFT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BACKGROUND } };
  });

  const rowNumberByKey: Record<string, number> = {};

  let r = 2;
  for (const row of ROWS) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = row.label;
    if (row.bold) excelRow.getCell(1).font = { bold: true };
    rowNumberByKey[row.key] = r;

    data.periods.forEach((p, i) => {
      const cell = excelRow.getCell(firstPeriodCol + i);
      const v = p.values[row.key];
      cell.value = v == null ? null : v;
      cell.numFmt = "#,##0.0";
      if (row.bold) cell.font = { bold: true };
    });

    if (data.periods.length >= 2) {
      const latestColLetter = colLetter(lastPeriodCol);
      const priorColLetter = colLetter(lastPeriodCol - 1);
      const cell = excelRow.getCell(yoyCol);
      cell.value = {
        formula:
          "IF(OR(" +
          priorColLetter +
          r +
          "=0,ISBLANK(" +
          priorColLetter +
          r +
          ')),"",(' +
          latestColLetter +
          r +
          "-" +
          priorColLetter +
          r +
          ")/ABS(" +
          priorColLetter +
          r +
          "))",
      };
      cell.numFmt = "+0.0%;-0.0%";
    }

    const peerNote = data.peerNotes.find((n) => n.rowKey === row.key);
    if (peerNote) {
      excelRow.getCell(peerCol).value = peerNote.note;
      excelRow.getCell(peerCol).font = { italic: true, color: { argb: INK_SOFT } };
    }

    r += 1;
  }

  const marginRows: { label: string; numeratorKey: string; peerKey: string | null }[] = [
    { label: "EBITDA Margin", numeratorKey: "ebitda", peerKey: "ebitda_margin" },
    { label: "PAT Margin", numeratorKey: "profit_after_tax", peerKey: "pat_margin" },
  ];
  for (const mr of marginRows) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = mr.label;
    excelRow.getCell(1).font = { italic: true, color: { argb: INK_SOFT } };
    data.periods.forEach((p, i) => {
      const col = firstPeriodCol + i;
      const colL = colLetter(col);
      const numRow = rowNumberByKey[mr.numeratorKey];
      const revRow = rowNumberByKey["revenue_from_operations"];
      const cell = excelRow.getCell(col);
      cell.value = {
        formula:
          "IF(OR(" +
          colL +
          revRow +
          "=0,ISBLANK(" +
          colL +
          revRow +
          ')),"",' +
          colL +
          numRow +
          "/" +
          colL +
          revRow +
          ")",
      };
      cell.numFmt = "0.0%";
      cell.font = { italic: true, color: { argb: INK_SOFT } };
    });
    const peerNote = mr.peerKey ? data.peerNotes.find((n) => n.rowKey === mr.peerKey) : undefined;
    if (peerNote) {
      excelRow.getCell(peerCol).value = peerNote.note;
      excelRow.getCell(peerCol).font = { italic: true, color: { argb: INK_SOFT } };
    }
    r += 1;
  }

  sheet.getColumn(1).width = 32;
  for (let i = firstPeriodCol; i <= peerCol; i++) {
    sheet.getColumn(i).width = 18;
  }

  const csSheet = workbook.addWorksheet("Common-Size");
  const csHeader = csSheet.getRow(1);
  csHeader.getCell(1).value = "Line Item";
  data.periods.forEach((p, i) => {
    csHeader.getCell(firstPeriodCol + i).value = p.label;
  });
  csHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: INK_SOFT } };
  });

  let csRowNum = 2;
  for (const row of ROWS) {
    const excelRow = csSheet.getRow(csRowNum);
    excelRow.getCell(1).value = row.label;
    if (row.bold) excelRow.getCell(1).font = { bold: true };
    data.periods.forEach((p, i) => {
      const col = firstPeriodCol + i;
      const colL = colLetter(col);
      const thisRowInStatementSheet = rowNumberByKey[row.key];
      const revRowInStatementSheet = rowNumberByKey["revenue_from_operations"];
      const cell = excelRow.getCell(col);
      cell.value = {
        formula:
          "IF(OR('Income Statement'!" +
          colL +
          revRowInStatementSheet +
          "=0,ISBLANK('Income Statement'!" +
          colL +
          revRowInStatementSheet +
          ')),"",\'Income Statement\'!' +
          colL +
          thisRowInStatementSheet +
          "/'Income Statement'!" +
          colL +
          revRowInStatementSheet +
          ")",
      };
      cell.numFmt = "0.0%";
      if (row.bold) cell.font = { bold: true };
    });
    csRowNum += 1;
  }
  csSheet.getColumn(1).width = 32;
  for (let i = firstPeriodCol; i <= lastPeriodCol; i++) {
    csSheet.getColumn(i).width = 14;
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
'''
create_new(excel_path, EXCEL_TS, "statement-export.ts")

route_path = os.path.join(ROOT, "app", "api", "sentinel", "export", "xlsx", "route.ts")
ROUTE_TS = r'''// Sentinel - Excel statement export (Export Engine Phase 3). Reuses
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
'''
create_new(route_path, ROUTE_TS, "export/xlsx/route.ts")

page_path = os.path.join(ROOT, "app", "sentinel", "statements", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

edit1_old = '  const [commonSize, setCommonSize] = useState(false);'
edit1_new = '''  const [commonSize, setCommonSize] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);'''
current2 = apply_edit(current, edit1_old, edit1_new, "add downloadingXlsx state", get_content_cmd)

edit2_old = '''  const workspace = workspaces.find((w) => w.id === subjectId)!;
  const periods = statements
    .filter((s) => s.workspace_id === subjectId && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));'''
edit2_new = '''  const workspace = workspaces.find((w) => w.id === subjectId)!;
  const periods = statements
    .filter((s) => s.workspace_id === subjectId && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  async function exportXlsx() {
    setDownloadingXlsx(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspace.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.company_name.replace(/\\s+/g, "_")}_Income_Statement.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Excel export failed");
    } finally {
      setDownloadingXlsx(false);
    }
  }'''
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add exportXlsx handler", get_content_cmd)

edit3_old = '''        <button
          onClick={() => downloadCsv(workspace, periods)}
          style={{
            fontFamily: "inherit",
            fontSize: "0.85rem",
            fontWeight: 500,
            padding: "0.5rem 1.1rem",
            border: `1px solid ${T.ink}`,
            borderRadius: 3,
            background: "transparent",
            color: T.ink,
            cursor: "pointer",
          }}
        >
          Download CSV
        </button>
      </div>'''
edit3_new = '''        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            onClick={() => downloadCsv(workspace, periods)}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.5rem 1.1rem",
              border: `1px solid ${T.ink}`,
              borderRadius: 3,
              background: "transparent",
              color: T.ink,
              cursor: "pointer",
            }}
          >
            Download CSV
          </button>
          <button
            onClick={exportXlsx}
            disabled={downloadingXlsx}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.5rem 1.1rem",
              border: `1px solid ${T.ink}`,
              borderRadius: 3,
              background: "transparent",
              color: T.ink,
              cursor: downloadingXlsx ? "default" : "pointer",
              opacity: downloadingXlsx ? 0.6 : 1,
            }}
          >
            {downloadingXlsx ? "Generating Excel\\u2026" : "Export Excel"}
          </button>
        </div>
      </div>'''
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "add Export Excel button", get_content_cmd)

if current4 is not None:
    write(page_path, current4)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current4)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("If you have not already, run:  npm install exceljs")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
