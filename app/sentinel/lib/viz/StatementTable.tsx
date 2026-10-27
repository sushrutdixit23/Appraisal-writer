"use client";

// Sentinel viz - the comparative statement: line items down, periods across, the way an analyst lays a statement out.
// Subtotals are heavier and ruled; costs are indented; negatives are in brackets; a missing figure is a dash, never a
// zero. Beside the periods: the shape of each line (a sparkline), its change on the same basis a year earlier (with
// whether that is good news), its compound growth when there are three years or more, and how it stands against the
// closest peer. Hover a figure and its row and its column light up, so the eye keeps its place in a wide table.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { formatAccounting, formatPercent, formatPoints, formatSignedPercent } from "./format";
import { cagr, deltaTone, pctChange, pointChange, yearsBetween, type Desirability } from "./semantics";
import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { MOTION, VIZ } from "./tokens";
import type { FinancialStatement } from "../types";

export type StatementRowDef = {
  key: string;
  label: string;
  bold?: boolean;
  indent?: boolean;
  /** Is a rise in this line good news? Revenue and profit: higher. Costs rise with the business: neutral. */
  want: Desirability;
  /** "percent" rows are ratios (margins) and are compared in percentage points. */
  kind?: "amount" | "percent";
  get: (s: FinancialStatement) => number | null;
};

export function StatementTable({
  periods,
  rows,
  convert,
  commonSize,
  latest,
  prior,
  showCagr,
  vsPeers,
  unitLabel,
  footnote,
}: {
  /** Oldest first. */
  periods: FinancialStatement[];
  rows: StatementRowDef[];
  /** From the company's unit to the display unit. */
  convert: (v: number) => number;
  commonSize: boolean;
  latest: FinancialStatement | null;
  /** The same-basis prior year of `latest`, or null. */
  prior: FinancialStatement | null;
  showCagr: boolean;
  vsPeers?: Record<string, string | null>;
  unitLabel: string;
  footnote?: string | null;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ row: string; col: number } | null>(null);
  const showYoy = !commonSize && !!latest && !!prior;
  const showTrend = !commonSize && periods.length >= 2;
  const showPeers = !commonSize && !!vsPeers && Object.values(vsPeers).some(Boolean);
  const lastIndex = periods.length - 1;

  const first = periods[0];
  const last = periods[lastIndex];
  const years = first && last ? yearsBetween(first.period_end_date, last.period_end_date) : 0;

  const cellValue = (row: StatementRowDef, s: FinancialStatement): string => {
    const v = row.get(s);
    if (v == null) return "—";
    if (row.kind === "percent") return formatPercent(v);
    if (commonSize) {
      const rev = s.revenue_from_operations;
      return rev ? `${((v / rev) * 100).toFixed(1)}%` : "—";
    }
    return formatAccounting(convert(v), 1);
  };

  const th: React.CSSProperties = { padding: "0.6rem 0.9rem", textAlign: "right", fontFamily: "inherit", verticalAlign: "bottom", background: VIZ.surface, borderBottom: `1px solid ${T.rule}`, whiteSpace: "nowrap" };

  return (
    <div style={{ background: VIZ.surface, border: `1px solid ${T.rule}`, borderRadius: 3, overflow: "hidden" }}>
      <div role="region" aria-label={`Comparative income statement, ${unitLabel}`} tabIndex={0} style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.86rem" }} onPointerLeave={() => setHover(null)}>
          <caption style={{ position: "absolute", left: -9999 }}>Comparative income statement in {unitLabel}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: "left", position: "sticky", left: 0, zIndex: 2, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, fontWeight: 600 }}>
                Line item
              </th>
              {periods.map((p, i) => (
                <th key={p.id ?? `${p.period_label}-${p.basis}`} scope="col" style={{ ...th, borderTop: `2px solid ${i === lastIndex ? VIZ.subject : "transparent"}` }}>
                  <span style={{ display: "block", fontFamily: "var(--font-serif, inherit)", fontSize: "0.95rem", fontWeight: 600, color: T.ink }}>{p.period_label}</span>
                  <span style={{ display: "block", fontSize: "0.62rem", fontWeight: 400, textTransform: "uppercase", color: VIZ.textSoft }}>{p.basis}</span>
                </th>
              ))}
              {showTrend && <th scope="col" style={{ ...th, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, fontWeight: 600 }}>Trend</th>}
              {showYoy && (
                <th scope="col" style={{ ...th, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.subject, fontWeight: 600 }}>
                  YoY
                  <span style={{ display: "block", fontSize: "0.62rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: VIZ.textSoft }}>{latest!.period_label} vs {prior!.period_label}</span>
                </th>
              )}
              {showTrend && showCagr && (
                <th scope="col" style={{ ...th, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, fontWeight: 600 }}>
                  CAGR
                  <span style={{ display: "block", fontSize: "0.62rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{years} yrs</span>
                </th>
              )}
              {showPeers && <th scope="col" style={{ ...th, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, fontWeight: 600 }}>vs closest peer</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const rowHot = hover?.row === row.key;
              const wash = rowHot ? VIZ.wash : VIZ.surface;
              const base: React.CSSProperties = { padding: "0.55rem 0.9rem", textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${VIZ.grid}`, borderTop: row.bold && ri > 0 ? `1px solid ${T.rule}` : undefined, whiteSpace: "nowrap", fontWeight: row.bold ? 600 : 400, color: row.bold ? T.ink : T.inkSoft };
              const values = periods.map((p) => row.get(p));
              const spark = values.map((v) => (v == null ? null : row.kind === "percent" ? v : convert(v)));
              const kind = row.kind ?? "amount";
              const change = showYoy ? (kind === "percent" ? pointChange(row.get(latest!), row.get(prior!)) : pctChange(row.get(latest!), row.get(prior!))) : null;
              const tone = deltaTone(change, row.want);
              const g = showCagr && kind === "amount" ? cagr(values[0], values[lastIndex], years) : null;
              return (
                <motion.tr key={row.key} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : ri * 0.025, duration: MOTION.base, ease: MOTION.ease }}>
                  <th scope="row" style={{ ...base, textAlign: "left", position: "sticky", left: 0, zIndex: 1, background: wash, paddingLeft: row.indent ? "1.7rem" : "0.9rem", fontStyle: row.kind === "percent" ? "italic" : "normal", fontWeight: row.bold ? 600 : 400, transition: "background 100ms" }}>
                    {row.label}
                  </th>
                  {periods.map((p, ci) => {
                    const colHot = hover?.col === ci;
                    return (
                      <td
                        key={p.id ?? `${p.period_label}-${p.basis}`}
                        onPointerEnter={() => setHover({ row: row.key, col: ci })}
                        style={{ ...base, background: rowHot && colHot ? "#F1E9DA" : rowHot || colHot ? VIZ.wash : ci === lastIndex ? "#FDFBF7" : VIZ.surface, color: row.bold ? T.ink : T.ink, fontStyle: row.kind === "percent" ? "italic" : "normal", transition: "background 100ms" }}
                      >
                        {cellValue(row, p)}
                      </td>
                    );
                  })}
                  {showTrend && (
                    <td style={{ ...base, background: wash }}>
                      <span style={{ display: "inline-block", verticalAlign: "middle" }}>
                        <Sparkline values={spark} width={72} height={22} title={`${row.label} across ${periods.map((p) => p.period_label).join(", ")}`} />
                      </span>
                    </td>
                  )}
                  {showYoy && (
                    <td style={{ ...base, background: wash }}>
                      {change == null || !tone ? "—" : <DeltaChip compact text={kind === "percent" ? formatPoints(change) : formatSignedPercent(change)} change={change} tone={tone} />}
                    </td>
                  )}
                  {showTrend && showCagr && <td style={{ ...base, background: wash, color: T.inkSoft }}>{g == null ? "—" : formatSignedPercent(g)}</td>}
                  {showPeers && <td style={{ ...base, background: wash, fontSize: "0.78rem", fontWeight: 400, color: T.inkSoft }}>{vsPeers?.[row.key] ?? "—"}</td>}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, padding: "0.6rem 0.9rem", fontSize: "0.72rem", color: VIZ.textSoft, borderTop: `1px solid ${T.rule}`, lineHeight: 1.5 }}>
        {commonSize ? "Every line as a share of that period's revenue from operations." : `Amounts in ${unitLabel}; negatives in brackets; a dash means no figure on file.`}
        {showYoy ? " Arrows show direction; blue is favourable, orange unfavourable; costs rising with the business are left neutral." : ""}
        {footnote ? ` ${footnote}` : ""}
      </p>
    </div>
  );
}
