"use client";

// Sentinel viz - the frame every chart sits in: a figure with a caption, a Chart / Table switch, and the table view
// itself. The table is the chart's twin, not a convenience: every value in the picture is in it, in text, so the
// chart is never the only way to read the data (and a reader on a screen reader, in print, or who simply wants to
// copy a number, has it).

import { useState } from "react";
import { T } from "../theme";
import { Segmented } from "./Segmented";
import { VIZ } from "./tokens";

export type TableTwin = { head: string[]; rows: (string | number | null)[][]; caption?: string };

export function ChartShell({
  ariaLabel,
  caption,
  table,
  controls,
  legend,
  footer,
  children,
}: {
  ariaLabel: string;
  caption?: string | null;
  table: TableTwin;
  /** Left of the Chart / Table switch, same row (a mode switch for this chart). */
  controls?: React.ReactNode;
  /** Its own row beneath. */
  legend?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <figure style={{ margin: 0 }} aria-label={ariaLabel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap", marginBottom: legend ? "0.55rem" : "0.7rem" }}>
        <div style={{ minWidth: 0 }}>{controls}</div>
        <Segmented
          ariaLabel={`${ariaLabel}: view`}
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {legend && <div style={{ marginBottom: "0.7rem" }}>{legend}</div>}
      {view === "chart" ? (
        children
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <caption style={{ position: "absolute", left: -9999 }}>{table.caption ?? ariaLabel}</caption>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h + i} scope="col" style={{ textAlign: i === 0 ? "left" : "right", padding: "0.45rem 0.7rem", fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, fontWeight: 600, borderBottom: `1px solid ${T.rule}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row" style={{ textAlign: "left", padding: "0.4rem 0.7rem", fontWeight: 500, borderBottom: `1px solid ${VIZ.grid}` }}>{c ?? "—"}</th>
                    ) : (
                      <td key={ci} style={{ textAlign: "right", padding: "0.4rem 0.7rem", fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${VIZ.grid}` }}>{c ?? "—"}</td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(caption || footer) && (
        <figcaption style={{ marginTop: "0.7rem", fontSize: "0.74rem", color: VIZ.textSoft, lineHeight: 1.5 }}>
          {caption}
          {footer}
        </figcaption>
      )}
    </figure>
  );
}
