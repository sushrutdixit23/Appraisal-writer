"use client";
export const dynamic = "force-dynamic";

// Sentinel — Financial Statements. The thing that makes this a tool an
// analyst actually uses instead of their own spreadsheet: a real
// comparative statement table (line items down, periods across, YoY%),
// with common-size toggle and CSV export so the numbers can leave
// Sentinel and land in someone's actual model. Narratives are color;
// this is the product for an analyst.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

type RowDef = {
  label: string;
  key: keyof FinancialStatement;
  bold?: boolean;
  indent?: boolean;
};

const ROWS: RowDef[] = [
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

const selectStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.6rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
};

function fmtValue(value: number | null, commonSize: boolean, revenue: number | null): string {
  if (value == null) return "\u2014";
  if (commonSize) {
    if (revenue == null || revenue === 0) return "\u2014";
    return `${((value / revenue) * 100).toFixed(1)}%`;
  }
  return value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function yoyPct(current: number | null, prior: number | null): string {
  if (current == null || prior == null || prior === 0) return "\u2014";
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function downloadCsv(workspace: Workspace, periods: FinancialStatement[]) {
  const lines: string[] = [];
  lines.push(["Line Item", ...periods.map((p) => p.period_label)].join(","));
  for (const row of ROWS) {
    const cells = periods.map((p) => {
      const v = p[row.key] as number | null;
      return v == null ? "" : String(v);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [commonSize, setCommonSize] = useState(false);

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
      const ws = (wsData ?? []) as Workspace[];
      setWorkspaces(ws);
      if (ws.length > 0) setSubjectId(ws[0].id);

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

  const ebitdaMargins = periods.map((p) =>
    p.ebitda != null && p.revenue_from_operations !== 0 ? p.ebitda / p.revenue_from_operations : null
  );
  const patMargins = periods.map((p) =>
    p.revenue_from_operations !== 0 ? p.profit_after_tax / p.revenue_from_operations : null
  );

  const cellStyle: React.CSSProperties = {
    padding: "0.55rem 0.9rem",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.87rem",
    borderBottom: `1px solid ${T.rule}`,
  };
  const labelCellStyle: React.CSSProperties = {
    padding: "0.55rem 0.9rem",
    textAlign: "left",
    fontSize: "0.87rem",
    borderBottom: `1px solid ${T.rule}`,
  };

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
        Income Statement — {workspace.currency_unit.replace("_", " ")}, all figures as reported
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.company_name}
              </option>
            ))}
          </select>
          <label style={{ fontSize: "0.8rem", color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={commonSize} onChange={(e) => setCommonSize(e.target.checked)} />
            Show as % of revenue
          </label>
        </div>
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
      </div>

      {periods.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: T.inkSoft }}>No annual statements available for this company yet.</p>
      ) : (
        <div style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...labelCellStyle, fontWeight: 600, color: T.inkSoft, fontSize: "0.72rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Line Item
                </th>
                {periods.map((p) => (
                  <th
                    key={p.id}
                    style={{ ...cellStyle, fontFamily: SERIF, fontWeight: 600, fontSize: "0.95rem", color: T.ink }}
                  >
                    {p.period_label}
                    <div style={{ fontSize: "0.65rem", fontWeight: 400, color: T.inkSoft, textTransform: "uppercase" }}>
                      {p.basis}
                    </div>
                  </th>
                ))}
                {periods.length >= 2 && !commonSize && (
                  <th style={{ ...cellStyle, fontWeight: 600, color: T.accent, fontSize: "0.75rem", textTransform: "uppercase" }}>
                    YoY %
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <td
                    style={{
                      ...labelCellStyle,
                      fontWeight: row.bold ? 600 : 400,
                      paddingLeft: row.indent ? "1.6rem" : "0.9rem",
                      color: row.bold ? T.ink : T.inkSoft,
                    }}
                  >
                    {row.label}
                  </td>
                  {periods.map((p) => (
                    <td key={p.id} style={{ ...cellStyle, fontWeight: row.bold ? 600 : 400 }}>
                      {fmtValue(p[row.key] as number | null, commonSize, p.revenue_from_operations)}
                    </td>
                  ))}
                  {periods.length >= 2 && !commonSize && (
                    <td style={{ ...cellStyle, color: T.inkSoft }}>
                      {yoyPct(
                        periods[periods.length - 1][row.key] as number | null,
                        periods[periods.length - 2][row.key] as number | null
                      )}
                    </td>
                  )}
                </tr>
              ))}
              <tr>
                <td style={{ ...labelCellStyle, fontWeight: 400, color: T.inkSoft, fontStyle: "italic" }}>
                  EBITDA Margin
                </td>
                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {ebitdaMargins[i] != null ? `${(ebitdaMargins[i]! * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
              </tr>
              <tr>
                <td style={{ ...labelCellStyle, fontWeight: 400, color: T.inkSoft, fontStyle: "italic" }}>
                  PAT Margin
                </td>
                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {patMargins[i] != null ? `${(patMargins[i]! * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "1rem" }}>
        Balance Sheet and Cash Flow are not yet extracted for the demo dataset — Income Statement only, for now.
      </p>
    </div>
  );
}
