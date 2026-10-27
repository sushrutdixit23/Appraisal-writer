"use client";
export const dynamic = "force-dynamic";

// Sentinel — Financial Statements. The thing that makes this a tool an
// analyst actually uses instead of their own spreadsheet: a real
// comparative statement table (line items down, periods across, YoY%),
// with common-size toggle and CSV export so the numbers can leave
// Sentinel and land in someone's actual model. Narratives are color;
// this is the product for an analyst.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildPeerTable, findPriorYear } from "../lib/engine";
import { sortWorkspaces, workspaceOptionLabel } from "../lib/access";
import { useDisplayUnit, type DisplayUnit } from "../lib/displayUnit";
import { displayFormat, type DisplayFormat } from "../lib/displayUnitCore";
import { useShell } from "../lib/shell/ShellData";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { buildProfitBridge } from "../lib/viz/bridge";
import { StatementTable, type StatementRowDef } from "../lib/viz/StatementTable";
import { Waterfall } from "../lib/viz/Waterfall";
import { VIZ } from "../lib/viz/tokens";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

type RowDef = {
  label: string;
  key: keyof FinancialStatement;
  bold?: boolean;
  indent?: boolean;
};

const CSV_ROWS: RowDef[] = [
  { label: "Revenue from Operations", key: "revenue_from_operations", bold: true },
  { label: "Other Income", key: "other_income", indent: true },
  { label: "Total Income", key: "total_income", bold: true },
  { label: "Total Expenses", key: "total_expenses", indent: true },
  { label: "EBITDA", key: "ebitda", bold: true },
  { label: "Depreciation & Amortisation", key: "depreciation_amortisation", indent: true },
  { label: "Finance Costs", key: "finance_costs", indent: true },
  { label: "Exceptional Items", key: "exceptional_items", indent: true },
  { label: "Profit Before Tax", key: "profit_before_tax", bold: true },
  { label: "Tax Expense", key: "tax_expense", indent: true },
  { label: "Profit After Tax", key: "profit_after_tax", bold: true },
];

// What each line means when it moves. Revenue and profit: up is good. Costs rise with the business, so they are
// left neutral rather than painted as bad news.
const num = (key: keyof FinancialStatement) => (s: FinancialStatement) => (s[key] as number | null) ?? null;
const TABLE_ROWS: StatementRowDef[] = [
  { key: "revenue_from_operations", label: "Revenue from Operations", bold: true, want: "higher", get: num("revenue_from_operations") },
  { key: "other_income", label: "Other Income", indent: true, want: "higher", get: num("other_income") },
  { key: "total_income", label: "Total Income", bold: true, want: "higher", get: num("total_income") },
  { key: "total_expenses", label: "Total Expenses", indent: true, want: "neutral", get: num("total_expenses") },
  { key: "ebitda", label: "EBITDA", bold: true, want: "higher", get: num("ebitda") },
  { key: "depreciation_amortisation", label: "Depreciation & Amortisation", indent: true, want: "neutral", get: num("depreciation_amortisation") },
  { key: "finance_costs", label: "Finance Costs", indent: true, want: "neutral", get: num("finance_costs") },
  { key: "exceptional_items", label: "Exceptional Items", indent: true, want: "neutral", get: num("exceptional_items") },
  { key: "profit_before_tax", label: "Profit Before Tax", bold: true, want: "higher", get: num("profit_before_tax") },
  { key: "tax_expense", label: "Tax Expense", indent: true, want: "neutral", get: num("tax_expense") },
  { key: "profit_after_tax", label: "Profit After Tax", bold: true, want: "higher", get: num("profit_after_tax") },
  { key: "ebitda_margin", label: "EBITDA Margin", kind: "percent", want: "higher", get: (s) => (s.ebitda != null && s.revenue_from_operations ? s.ebitda / s.revenue_from_operations : null) },
  { key: "pat_margin", label: "PAT Margin", kind: "percent", want: "higher", get: (s) => (s.revenue_from_operations ? s.profit_after_tax / s.revenue_from_operations : null) },
];

const selectStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.6rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
};

function formatVsPeer(b: Benchmark | null | undefined, isRatio: boolean, du: DisplayFormat): string {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return "\u2014";
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${du.fromCrore(b.gapToClosestPeer).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${du.crossShort}`.trim();
  return `${gap} vs ${b.closestPeer.company_name}`;
}

function downloadCsv(workspace: Workspace, periods: FinancialStatement[], unit: DisplayUnit) {
  const du = displayFormat(unit);
  const lines: string[] = [];
  lines.push([`"Line Item (${du.ownLabel(workspace.currency_unit)})"`, ...periods.map((p) => `"${p.period_label} (${p.basis})"`)].join(","));
  for (const row of CSV_ROWS) {
    const cells = periods.map((p) => {
      const v = p[row.key] as number | null;
      // Converted, with the binary noise removed, so a lakh figure does not export as 123456.00000000001.
      return v == null ? "" : String(Number(du.fromCompany(v, workspace.currency_unit).toPrecision(12)));
    });
    lines.push([`"${row.label}"`, ...cells].join(","));
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${workspace.company_name.replace(/\s+/g, "_")}_income_statement.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FinancialStatementsPage() {
  const router = useRouter();
  const { userId: shellUserId } = useShell();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [userId, setUserId] = useState("");
  const [subjectId, setSubjectId] = useSelectedWorkspace(workspaces.map((w) => w.id));
  const [commonSize, setCommonSize] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const du = useDisplayUnit();

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const { data: wsData, error: wsError } = await supabase.from("sentinel_workspaces").select("*");
      if (wsError) {
        setError(wsError.message);
        setLoading(false);
        return;
      }
      const ws = sortWorkspaces((wsData ?? []) as Workspace[], sessionData.session.user.id);
      setUserId(sessionData.session.user.id);
      setWorkspaces(ws);

      const { data: stmtData, error: stmtError } = await supabase
        .from("sentinel_statements")
        .select("*")
        .in("workspace_id", ws.map((w) => w.id));
      if (stmtError) {
        setError(stmtError.message);
      } else {
        setStatements((stmtData ?? []) as FinancialStatement[]);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;
  if (workspaces.length === 0 || !subjectId) {
    return <p style={{ color: T.inkSoft }}>No workspaces available yet.</p>;
  }

  const workspace = workspaces.find((w) => w.id === subjectId)!;
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
        body: JSON.stringify({ workspace_id: workspace.id, unit: du.unit }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.company_name.replace(/\s+/g, "_")}_Income_Statement.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Excel export failed");
    } finally {
      setDownloadingXlsx(false);
    }
  }

  // Benchmark Engine wiring: peer context is inherently latest-period,
  // same scoping YoY% already uses (last two periods only, regardless
  // of how many years the table shows) - "vs Peers" sits alongside
  // YoY% as a single extra column rather than one per period.
  // Year-on-year compares the latest period with the SAME basis one year earlier - not with whatever
  // column happens to sit next to it, which could be a missing year or the other basis.
  const latestPeriod = periods[periods.length - 1] ?? null;
  const priorPeriod = latestPeriod ? findPriorYear(latestPeriod, statements) : null;
  const showYoy = !commonSize && latestPeriod != null && priorPeriod != null;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === workspace.sector);
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const showPeerCol = !commonSize && peerRows.length > 1;
  const rowBenchmarks: Partial<Record<keyof FinancialStatement, Benchmark>> = {
    revenue_from_operations: getBenchmark(peerRows, subjectId, "revenue_cr"),
    profit_before_tax: getBenchmark(peerRows, subjectId, "pbt_cr"),
    profit_after_tax: getBenchmark(peerRows, subjectId, "pat_cr"),
  };
  const ebitdaMarginBenchmark = getBenchmark(peerRows, subjectId, "ebitda_margin");
  const patMarginBenchmark = getBenchmark(peerRows, subjectId, "pat_margin");

  const vsPeers: Record<string, string | null> = {
    revenue_from_operations: formatVsPeer(rowBenchmarks.revenue_from_operations, false, du),
    profit_before_tax: formatVsPeer(rowBenchmarks.profit_before_tax, false, du),
    profit_after_tax: formatVsPeer(rowBenchmarks.profit_after_tax, false, du),
    ebitda_margin: formatVsPeer(ebitdaMarginBenchmark, true, du),
    pat_margin: formatVsPeer(patMarginBenchmark, true, du),
  };

  // The bridge is built from the latest year in the display unit, so every step is in the same unit as the table.
  const converted = latestPeriod
    ? ({
        ...latestPeriod,
        ...Object.fromEntries(
          (["revenue_from_operations", "other_income", "total_income", "total_expenses", "depreciation_amortisation", "finance_costs", "exceptional_items", "profit_before_tax", "tax_expense", "profit_after_tax"] as const).map((k) => {
            const v = latestPeriod[k] as number | null;
            return [k, v == null ? null : Number(du.fromCompany(v, workspace.currency_unit).toPrecision(12))];
          })
        ),
      } as FinancialStatement)
    : null;
  const bridge = converted ? buildProfitBridge(converted) : null;
  const bridgeDecimals = converted && Math.abs(converted.revenue_from_operations) < 200 ? 1 : 0;

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Financial Statements
      </h1>
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0.45rem 0 1.5rem 0",
        }}
      >
        Income Statement — {du.ownLabel(workspace.currency_unit)}{du.unit === "as_reported" ? ", all figures as reported" : ", converted for display"}
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <select aria-label="Company" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {workspaceOptionLabel(w, userId)}
              </option>
            ))}
          </select>
          <label style={{ fontSize: "0.8rem", color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={commonSize} onChange={(e) => setCommonSize(e.target.checked)} />
            Show as % of revenue
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            onClick={() => downloadCsv(workspace, periods, du.unit)}
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
            {downloadingXlsx ? "Generating Excel\u2026" : "Export Excel"}
          </button>
        </div>
      </div>

      {periods.length === 0 ? (
        <section aria-label="No statements yet" data-testid="empty-statements" style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "2rem 1.6rem", textAlign: "center" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.3rem", margin: "0 0 0.4rem 0" }}>No financial statements yet</h2>
          {workspace.owner_id === shellUserId ? (
            <>
              <p style={{ fontSize: "0.88rem", color: T.inkSoft, margin: "0 auto 1.1rem auto", maxWidth: 480, lineHeight: 1.55 }}>
                Import an annual report or results PDF, a CSV or an Excel sheet. Every period found is previewed with the line each figure came from before anything is saved.
              </p>
              <Link href={`/sentinel/projects/${workspace.id}/import`} style={{ display: "inline-block", textDecoration: "none", fontSize: "0.88rem", fontWeight: 600, color: T.background, background: T.accent, padding: "0.6rem 1.4rem", borderRadius: 3 }}>
                Import a file
              </Link>
            </>
          ) : (
            <p style={{ fontSize: "0.88rem", color: T.inkSoft, margin: 0 }}>This reference company has no annual statements on file.</p>
          )}
        </section>
      ) : (
        <>
          <StatementTable
            periods={periods}
            rows={TABLE_ROWS}
            convert={(v) => du.fromCompany(v, workspace.currency_unit)}
            commonSize={commonSize}
            latest={latestPeriod}
            prior={priorPeriod}
            showCagr={new Set(periods.map((p) => p.basis)).size === 1 && periods.length >= 3}
            vsPeers={showPeerCol ? vsPeers : undefined}
            unitLabel={du.ownLabel(workspace.currency_unit)}
          />

          {bridge && latestPeriod && (
            <section aria-label="Revenue to profit" style={{ background: VIZ.surface, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.4rem 1.6rem", marginTop: "1.5rem" }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "1.05rem", margin: "0 0 0.3rem 0" }}>From revenue to profit</h2>
              <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 1.1rem 0" }}>
                {latestPeriod.period_label}, {latestPeriod.basis}, in {du.ownLabel(workspace.currency_unit)}. Where the filing&apos;s own lines leave a gap, the gap is shown as its own step.
              </p>
              <Waterfall bridge={bridge} decimals={bridgeDecimals} ariaLabel={`Revenue to profit after tax, ${latestPeriod.period_label}`} unitHeader={du.ownLabel(workspace.currency_unit)} />
            </section>
          )}
        </>
      )}

    </div>
  );
}
