# -*- coding: utf-8 -*-
"""
Sentinel — Export Engine Phase 1: PDF (MIS Pack). Creates the document
component + API route, and adds the "Export PDF" trigger to the KPI
Dashboard. Run from the repo root (the folder containing package.json).

Requires @react-pdf/renderer to be installed:
  npm install @react-pdf/renderer
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

def brace_balance(path, content):
    opens = content.count("{")
    closes = content.count("}")
    status = "OK" if opens == closes else "MISMATCH"
    print("  brace check " + path + ": { " + str(opens) + "  } " + str(closes) + "  -> " + status)
    return opens == closes

def unique_replace(content, old, new, label):
    count = content.count(old)
    if count != 1:
        print("!! ANCHOR FAILED (" + label + "): found " + str(count) + " occurrences, expected 1. Aborting this file.")
        return None
    return content.replace(old, new, 1)

def create_new(path, content, label):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        print("!! " + path + " already exists \u2014 not overwriting. Delete it first if you want a clean rebuild.")
        sys.exit(1)
    write(path, content)
    print("created " + path + " (" + str(len(content.encode("utf-8"))) + " bytes)")
    brace_balance(path, content)

# ---------------------------------------------------------------------
# 1. New files
# ---------------------------------------------------------------------
mispack_path = os.path.join(ROOT, "app", "sentinel", "lib", "pdf", "mis-pack.tsx")
MISPACK_TS = '''// Sentinel — MIS Pack PDF document (Phase 1 of the Export Engine).
// Pure presentational component: every number arrives already computed
// and formatted by the API route (using the same engine.ts/health.ts/
// benchmark.ts functions the app itself uses to render the KPI
// Dashboard, Business Health card, Financial Statements, and
// Investigation Queue), so this file has no business logic of its own
// and can never compute a figure differently from what the app shows
// on screen.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type MisPackKpi = { label: string; value: string; note: string | null };

export type MisPackHealthCategory = { label: string; status: string; detail: string | null };
export type MisPackHealth = { overall: string; categories: MisPackHealthCategory[] };

export type MisPackStatementRow = { label: string; values: (string | null)[]; bold?: boolean };

export type MisPackInvestigation = {
  periodLabel: string;
  status: string;
  confidenceScore: number | null;
  namedPeer: string | null;
  narrative: string;
};

export type MisPackData = {
  companyName: string;
  sectorLabel: string;
  periodLabel: string;
  basis: string;
  generatedAt: string;
  kpis: MisPackKpi[];
  health: MisPackHealth | null;
  periodLabels: string[];
  statementRows: MisPackStatementRow[];
  investigations: MisPackInvestigation[];
};

// Locked Sentinel palette (Black + Sandstone).
const INK = "#161616";
const INK_SOFT = "#5C5850";
const RULE = "#DCD5C7";
const CARD = "#FFFFFF";
const BACKGROUND = "#F7F3EB";
const ACCENT = "#A47551";

const HEALTH_TEXT: Record<string, string> = {
  healthy: "#2F5233",
  watch: "#8A6416",
  concern: "#9A4A1F",
  critical: "#8C2A2A",
  no_data: INK_SOFT,
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  concern: "Concern",
  critical: "Critical",
  no_data: "No data",
};

// Every border below is written as explicit borderWidth/Color/Style
// properties rather than a CSS shorthand string - react-pdf's layout
// engine (Yoga) reliably supports the explicit form across versions,
// where shorthand support has varied.
const styles = StyleSheet.create({
  page: {
    backgroundColor: BACKGROUND,
    padding: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  coverTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  coverSubtitle: { fontSize: 11, color: INK_SOFT, marginBottom: 24 },
  coverMetaRow: { flexDirection: "row", marginBottom: 4 },
  coverMetaLabel: {
    width: 100,
    color: INK_SOFT,
    fontSize: 9,
    textTransform: "uppercase",
  },
  coverMetaValue: { fontSize: 10 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    borderBottomStyle: "solid",
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap" },
  kpiCard: {
    width: "24%",
    backgroundColor: CARD,
    padding: 8,
    marginRight: "1%",
    marginBottom: 6,
  },
  kpiLabel: { fontSize: 7, color: INK_SOFT, textTransform: "uppercase", marginBottom: 3 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  kpiNote: { fontSize: 6.5, color: INK_SOFT },
  healthOverallRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  healthOverallLabel: { fontSize: 10, color: INK_SOFT, marginRight: 8, textTransform: "uppercase" },
  healthOverallPill: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  healthGrid: { flexDirection: "row", flexWrap: "wrap" },
  healthChip: {
    width: "23%",
    backgroundColor: CARD,
    padding: 7,
    marginRight: "2%",
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: RULE,
    borderLeftStyle: "solid",
  },
  healthChipLabel: { fontSize: 7, color: INK_SOFT, textTransform: "uppercase", marginBottom: 2 },
  healthChipStatus: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  table: { width: "100%" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    borderBottomStyle: "solid",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    borderBottomStyle: "solid",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableLabelCell: { width: "34%", fontSize: 8.5, paddingTop: 3, paddingBottom: 3 },
  tableValueCell: { flex: 1, fontSize: 8.5, textAlign: "right", paddingTop: 3, paddingBottom: 3 },
  tableHeaderLabelCell: { width: "34%", fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  tableHeaderValueCell: {
    flex: 1,
    fontSize: 7.5,
    color: INK_SOFT,
    textTransform: "uppercase",
    textAlign: "right",
  },
  investigationCard: {
    backgroundColor: CARD,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    borderLeftStyle: "solid",
  },
  investigationHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  investigationPeriod: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  investigationStatus: { fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  investigationNarrative: { fontSize: 8.5, lineHeight: 1.5, marginBottom: 4 },
  investigationMeta: { fontSize: 7.5, color: INK_SOFT },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7,
    color: INK_SOFT,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
});

function KpiGrid({ kpis }: { kpis: MisPackKpi[] }) {
  return (
    <View style={styles.kpiGrid}>
      {kpis.map((k) => (
        <View key={k.label} style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{k.label}</Text>
          <Text style={styles.kpiValue}>{k.value}</Text>
          {k.note && <Text style={styles.kpiNote}>{k.note}</Text>}
        </View>
      ))}
    </View>
  );
}

function HealthSection({ health }: { health: MisPackHealth }) {
  return (
    <View>
      <View style={styles.healthOverallRow}>
        <Text style={styles.healthOverallLabel}>Overall</Text>
        <Text style={{ ...styles.healthOverallPill, color: HEALTH_TEXT[health.overall] ?? INK_SOFT }}>
          {HEALTH_LABEL[health.overall] ?? health.overall}
        </Text>
      </View>
      <View style={styles.healthGrid}>
        {health.categories.map((c) => (
          <View
            key={c.label}
            style={{ ...styles.healthChip, borderLeftColor: HEALTH_TEXT[c.status] ?? RULE }}
          >
            <Text style={styles.healthChipLabel}>{c.label}</Text>
            <Text style={{ ...styles.healthChipStatus, color: HEALTH_TEXT[c.status] ?? INK_SOFT }}>
              {HEALTH_LABEL[c.status] ?? c.status}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatementTable({ periodLabels, rows }: { periodLabels: string[]; rows: MisPackStatementRow[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Text style={styles.tableHeaderLabelCell}>Line Item</Text>
        {periodLabels.map((p) => (
          <Text key={p} style={styles.tableHeaderValueCell}>
            {p}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.tableRow}>
          <Text
            style={{
              ...styles.tableLabelCell,
              ...(row.bold ? { fontFamily: "Helvetica-Bold" } : {}),
            }}
          >
            {row.label}
          </Text>
          {row.values.map((v, i) => (
            <Text
              key={i}
              style={{
                ...styles.tableValueCell,
                ...(row.bold ? { fontFamily: "Helvetica-Bold" } : {}),
              }}
            >
              {v ?? "\u2014"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function InvestigationsSection({ investigations }: { investigations: MisPackInvestigation[] }) {
  return (
    <View>
      {investigations.map((inv, i) => (
        <View key={i} style={styles.investigationCard} wrap={false}>
          <View style={styles.investigationHeader}>
            <Text style={styles.investigationPeriod}>{inv.periodLabel}</Text>
            <Text style={styles.investigationStatus}>{inv.status}</Text>
          </View>
          <Text style={styles.investigationNarrative}>{inv.narrative}</Text>
          <Text style={styles.investigationMeta}>
            {inv.confidenceScore != null ? `Confidence: ${inv.confidenceScore}%` : "Confidence: \u2014"}
            {inv.namedPeer ? `  \u00b7  Closest peer: ${inv.namedPeer}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MisPackDocument({ data }: { data: MisPackData }) {
  return (
    <Document title={`${data.companyName} \u2014 MIS Pack \u2014 ${data.periodLabel}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>{data.companyName}</Text>
        <Text style={styles.coverSubtitle}>Financial Intelligence Workspace \u2014 MIS Pack</Text>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Period</Text>
          <Text style={styles.coverMetaValue}>
            {data.periodLabel} ({data.basis})
          </Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Sector</Text>
          <Text style={styles.coverMetaValue}>{data.sectorLabel}</Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Generated</Text>
          <Text style={styles.coverMetaValue}>{data.generatedAt}</Text>
        </View>

        <Text style={styles.sectionTitle}>KPI Summary</Text>
        <KpiGrid kpis={data.kpis} />

        {data.health && (
          <>
            <Text style={styles.sectionTitle}>Business Health</Text>
            <HealthSection health={data.health} />
          </>
        )}

        <Text style={styles.sectionTitle}>Income Statement</Text>
        <StatementTable periodLabels={data.periodLabels} rows={data.statementRows} />

        {data.investigations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Key Investigations</Text>
            <InvestigationsSection investigations={data.investigations} />
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Sentinel \u2014 computed, not guessed \u00b7 Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
'''
create_new(mispack_path, MISPACK_TS, "mis-pack.tsx")

route_path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pdf", "route.ts")
ROUTE_TS = '''// Sentinel — MIS Pack PDF export (Export Engine Phase 1). Computes
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildPeerTable, findPriorYear } from "../../../../sentinel/lib/engine";
import { getBenchmark } from "../../../../sentinel/lib/benchmark";
import { computeHealthScore } from "../../../../sentinel/lib/health";
import { getSectorConfig } from "../../../../sentinel/lib/config";
import {
  MisPackDocument,
  type MisPackData,
  type MisPackKpi,
  type MisPackStatementRow,
  type MisPackInvestigation,
} from "../../../../sentinel/lib/pdf/mis-pack";
import type { FinancialStatement, Investigation, Workspace } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY!
);

// Same 12 metrics and formatting convention as the KPI Dashboard's
// page.tsx, deliberately duplicated here rather than imported (those
// formatters are page-local) - keep both in sync if either changes.
const pct = (v: number | null) => (v == null ? "\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "\u2014" : `${v.toFixed(0)}d`);
const ratioX = (v: number | null) => (v == null ? "\u2014" : `${v.toFixed(2)}x`);

function gapNote(
  b: ReturnType<typeof getBenchmark>,
  unit: "pp" | "cr" | "x" | "d"
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
      : `${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
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

  const kpis: MisPackKpi[] = KPI_DEFS.map((d) => {
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
        : v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }),
  }));

  // Key Investigations — approved/edited first (reviewed, most
  // defensible to show an executive), then pending, ranked by
  // confidence within each group; rejected and archived excluded. Top 5.
  const { data: invData, error: invError } = await supabaseAdmin
    .from("sentinel_investigations")
    .select("*")
    .eq("workspace_id", workspace_id);
  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 });
  }
  const allInvestigations = (invData ?? []) as Investigation[];
  const statusRank: Record<string, number> = { approved: 0, edited: 0, pending: 1 };
  const investigations: MisPackInvestigation[] = allInvestigations
    .filter((i) => i.status === "approved" || i.status === "edited" || i.status === "pending")
    .sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    })
    .slice(0, 5)
    .map((inv) => ({
      periodLabel: inv.period_label,
      status: inv.status,
      confidenceScore: inv.confidence_score,
      namedPeer: inv.named_peer,
      narrative:
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.",
    }));

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
    statementRows,
    investigations,
  };

  try {
    const buffer = await renderToBuffer(MisPackDocument({ data: pdfData }));
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${workspace.company_name.replace(
          /\s+/g,
          "_"
        )}_MIS_Pack_${latestStmt.period_label}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF generation failed." },
      { status: 502 }
    );
  }
}
'''
create_new(route_path, ROUTE_TS, "export/pdf/route.ts")

# ---------------------------------------------------------------------
# 2. KPI Dashboard trigger
# ---------------------------------------------------------------------
page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
page_src = read(page_path)

edits = []

edits.append((
    '''  const [selectedId, setSelectedId] = useState<string>("");''',
    '''  const [selectedId, setSelectedId] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);''',
    "page.tsx: add downloadingPdf state",
))

edits.append((
    '''  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0];
  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);''',
    '''  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0];

  async function exportPdf() {
    setDownloadingPdf(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: selected.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.company_name.replace(/\\s+/g, "_")}_MIS_Pack.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);''',
    "page.tsx: add exportPdf handler",
))

edits.append((
    '''      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{
          fontFamily: "inherit",
          fontSize: "0.9rem",
          padding: "0.5rem 0.8rem",
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          background: T.card,
          color: T.ink,
          marginBottom: "1.6rem",
        }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.company_name}
          </option>
        ))}
      </select>''',
    '''      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.6rem",
        }}
      >
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            fontFamily: "inherit",
            fontSize: "0.9rem",
            padding: "0.5rem 0.8rem",
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            background: T.card,
            color: T.ink,
          }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.company_name}
            </option>
          ))}
        </select>
        <button
          onClick={exportPdf}
          disabled={downloadingPdf}
          style={{
            fontFamily: "inherit",
            fontSize: "0.85rem",
            fontWeight: 500,
            padding: "0.5rem 1.1rem",
            border: `1px solid ${T.ink}`,
            borderRadius: 3,
            background: "transparent",
            color: T.ink,
            cursor: downloadingPdf ? "default" : "pointer",
            opacity: downloadingPdf ? 0.6 : 1,
          }}
        >
          {downloadingPdf ? "Generating PDF\\u2026" : "Export PDF"}
        </button>
      </div>''',
    "page.tsx: wrap select + add Export PDF button",
))

current = page_src
all_ok = True
for old, new, label in edits:
    result = unique_replace(current, old, new, label)
    if result is None:
        all_ok = False
        break
    current = result

if all_ok:
    write(page_path, current)
    print("edited " + page_path)
    brace_balance(page_path, current)
else:
    print("!! page.tsx NOT written due to an anchor failure above \\u2014 no partial write performed.")

print("")
print("If you haven't already, run:  npm install @react-pdf/renderer")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
