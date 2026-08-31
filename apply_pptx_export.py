# -*- coding: utf-8 -*-
"""
Sentinel - Export Engine Phase 2: PPTX (Board Deck). Creates the deck
builder + API route, and adds an "Export PPTX" button next to the
existing "Export PDF" button on the KPI Dashboard.

Run from the repo root (the folder containing package.json).
Requires pptxgenjs to be installed:
  npm install pptxgenjs
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

deck_path = os.path.join(ROOT, "app", "sentinel", "lib", "pptx", "board-deck.ts")
DECK_TS = r'''// Sentinel - Board Deck PPTX builder (Export Engine Phase 2). Same
// "pure builder, no business logic" pattern as mis-pack.tsx: every
// number arrives already computed and formatted by the API route, so
// this file only lays things out on slides. Deliberately shorter and
// more condensed than the MIS Pack PDF - a board deck gets skimmed in
// a meeting, not read line by line, so Key Findings shows headlines
// only (see firstSentence() in the route), not full narratives.
//
// Table row cells are left untyped against pptxgenjs's own TableRow
// type (cast with "as any" at the addTable call) rather than importing
// and asserting an exact type name from the pptxgenjs type defs - the
// exact exported type names vary across versions, and guessing wrong
// here would be the same class of build break as the Buffer/BodyInit
// mismatch hit in Phase 1. The cell object shape itself is unchanged
// and still renders correctly; only the compile-time type check is
// relaxed for this one call.

import pptxgen from "pptxgenjs";

export type BoardDeckKpi = { label: string; value: string; note: string | null };

export type BoardDeckHealthCategory = { label: string; status: string };
export type BoardDeckHealth = { overall: string; categories: BoardDeckHealthCategory[] };

export type BoardDeckFinding = {
  periodLabel: string;
  status: string;
  headline: string;
  confidenceScore: number | null;
};

export type BoardDeckData = {
  companyName: string;
  sectorLabel: string;
  periodLabel: string;
  basis: string;
  generatedAt: string;
  kpis: BoardDeckKpi[];
  health: BoardDeckHealth | null;
  findings: BoardDeckFinding[];
};

// Locked Sentinel palette (Black + Sandstone). pptxgenjs takes hex
// colors WITHOUT the leading "#".
const INK = "161616";
const INK_SOFT = "5C5850";
const RULE = "DCD5C7";
const CARD = "FFFFFF";
const BACKGROUND = "F7F3EB";
const ACCENT = "A47551";

const HEALTH_COLOR: Record<string, string> = {
  healthy: "2F5233",
  watch: "8A6416",
  concern: "9A4A1F",
  critical: "8C2A2A",
  no_data: INK_SOFT,
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  concern: "Concern",
  critical: "Critical",
  no_data: "No data",
};

function addTitleSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText(data.companyName, {
    x: 0.6,
    y: 2.0,
    w: 8.8,
    h: 1.0,
    fontSize: 32,
    bold: true,
    color: INK,
  });
  slide.addText("Financial Intelligence Workspace - Board Deck", {
    x: 0.6,
    y: 2.9,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: INK_SOFT,
  });
  slide.addText(
    data.periodLabel +
      " (" +
      data.basis +
      ")  -  " +
      data.sectorLabel +
      "  -  Generated " +
      data.generatedAt,
    { x: 0.6, y: 4.8, w: 8.8, h: 0.4, fontSize: 11, color: INK_SOFT }
  );
}

function addKpiSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("KPI Summary", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  const rows = [
    [
      { text: "Metric", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "Value", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "vs Peers", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
    ],
    ...data.kpis.map((k) => [
      { text: k.label, options: { fontSize: 10, color: INK } },
      { text: k.value, options: { fontSize: 10, bold: true, color: INK } },
      { text: k.note ?? "-", options: { fontSize: 9, color: INK_SOFT } },
    ]),
  ];
  slide.addTable(rows as any, {
    x: 0.4,
    y: 0.9,
    w: 9.2,
    border: { type: "solid", color: RULE, pt: 0.5 },
    fill: { color: CARD },
    autoPage: false,
  });
}

function addHealthSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("Business Health", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  if (!data.health) {
    slide.addText("No annual statement on file yet for this company.", {
      x: 0.4,
      y: 1.0,
      w: 9.2,
      h: 0.5,
      fontSize: 12,
      color: INK_SOFT,
    });
    return;
  }
  slide.addText(
    "Overall: " + (HEALTH_LABEL[data.health.overall] ?? data.health.overall),
    {
      x: 0.4,
      y: 0.9,
      w: 9.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: HEALTH_COLOR[data.health.overall] ?? INK_SOFT,
    }
  );
  const rows = [
    [
      { text: "Category", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "Status", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
    ],
    ...data.health.categories.map((c) => [
      { text: c.label, options: { fontSize: 10, color: INK } },
      {
        text: HEALTH_LABEL[c.status] ?? c.status,
        options: { fontSize: 10, bold: true, color: HEALTH_COLOR[c.status] ?? INK_SOFT },
      },
    ]),
  ];
  slide.addTable(rows as any, {
    x: 0.4,
    y: 1.5,
    w: 9.2,
    border: { type: "solid", color: RULE, pt: 0.5 },
    fill: { color: CARD },
    autoPage: false,
  });
}

function addFindingsSlide(pres: pptxgen, data: BoardDeckData): void {
  if (data.findings.length === 0) return;
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("Key Findings", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  let y = 1.0;
  for (const f of data.findings) {
    slide.addText(f.periodLabel + "  -  " + (HEALTH_LABEL[f.status] ?? f.status), {
      x: 0.4,
      y,
      w: 9.2,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: ACCENT,
    });
    y += 0.32;
    slide.addText(f.headline, { x: 0.4, y, w: 9.2, h: 0.5, fontSize: 11, color: INK });
    y += 0.55;
    slide.addText(
      f.confidenceScore != null ? "Confidence: " + f.confidenceScore + "%" : "Confidence: -",
      { x: 0.4, y, w: 9.2, h: 0.3, fontSize: 9, color: INK_SOFT }
    );
    y += 0.5;
  }
}

export async function buildBoardDeck(data: BoardDeckData): Promise<Buffer> {
  const pres = new pptxgen();
  addTitleSlide(pres, data);
  addKpiSlide(pres, data);
  addHealthSlide(pres, data);
  addFindingsSlide(pres, data);
  const buf = await pres.write({ outputType: "nodebuffer" });
  return buf as Buffer;
}
'''
create_new(deck_path, DECK_TS, "board-deck.ts")

route_path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pptx", "route.ts")
ROUTE_TS = r'''// Sentinel - Board Deck PPTX export (Export Engine Phase 2). Computes
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

function firstSentence(text: string, maxLen: number): string {
  const period = text.indexOf(". ");
  if (period !== -1 && period < maxLen) {
    return text.slice(0, period + 1);
  }
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "...";
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
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        headline: firstSentence(narrative, 160),
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
'''
create_new(route_path, ROUTE_TS, "export/pptx/route.ts")

page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
page_src = read(page_path)
current = page_src
get_content_cmd = page_path

edit1_old = '  const [downloadingPdf, setDownloadingPdf] = useState(false);'
edit1_new = '''  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);'''
current2 = apply_edit(current, edit1_old, edit1_new, "add downloadingPptx state", get_content_cmd)

edit2_old = '''  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;'''
edit2_new = '''  async function exportPptx() {
    setDownloadingPptx(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/pptx", {
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
      a.download = `${selected.company_name.replace(/\\s+/g, "_")}_Board_Deck.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PPTX export failed");
    } finally {
      setDownloadingPptx(false);
    }
  }

  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;'''
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add exportPptx handler", get_content_cmd)

edit3_old = '''        <button
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
          {downloadingPdf ? "Generating PDF..." : "Export PDF"}
        </button>
      </div>'''
edit3_new = '''        <div style={{ display: "flex", gap: "0.6rem" }}>
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
            {downloadingPdf ? "Generating PDF..." : "Export PDF"}
          </button>
          <button
            onClick={exportPptx}
            disabled={downloadingPptx}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.5rem 1.1rem",
              border: `1px solid ${T.ink}`,
              borderRadius: 3,
              background: "transparent",
              color: T.ink,
              cursor: downloadingPptx ? "default" : "pointer",
              opacity: downloadingPptx ? 0.6 : 1,
            }}
          >
            {downloadingPptx ? "Generating PPTX..." : "Export PPTX"}
          </button>
        </div>
      </div>'''
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "add Export PPTX button", get_content_cmd)

if current4 is not None:
    write(page_path, current4)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current4)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("If you have not already, run:  npm install pptxgenjs")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
