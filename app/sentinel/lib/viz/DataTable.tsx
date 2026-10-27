"use client";

// Sentinel viz - the benchmark table: companies down, measures across. Click a header to sort (the rows glide to their
// new places); each measure column is shaded by where a value stands WITHIN that column (darker = better, in the
// direction that measure improves), so the eye finds strengths and weak spots without reading a number. The company
// you are viewing is marked, and a peer-median row sits underneath. Header and first column stay in view while you
// scroll, and the whole table copies out as CSV.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { columnScores, heatColor, median, readableText } from "./peers";
import { nextSort, sortRows, toCsv, type SortDir } from "./table";
import { MOTION, VIZ } from "./tokens";

export type DataColumn<R> = {
  key: string;
  header: string;
  /** The unit, shown small under the header. */
  unit?: string;
  value: (row: R) => number | string | null;
  format?: (v: number) => string;
  /** Shade this column by position; the direction that is better. */
  heat?: "higher" | "lower";
  /** Direction the first click sorts: best-looking first for a measure, A-Z for a name. */
  natural?: SortDir;
};

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  isSubject,
  subjectLabel,
  ariaLabel,
  caption,
  csvName,
  initialSort,
}: {
  columns: DataColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  isSubject?: (row: R) => boolean;
  subjectLabel?: string;
  ariaLabel: string;
  caption?: string | null;
  csvName: string;
  initialSort?: { key: string; dir: SortDir };
}) {
  const reduce = useReducedMotion();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort ?? null);
  const [status, setStatus] = useState("");

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    return col && sort ? sortRows(rows, col.value, sort.dir) : rows;
  }, [rows, columns, sort]);

  const scores = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const c of columns) {
      if (!c.heat) continue;
      out[c.key] = columnScores(
        rows.map((r) => {
          const v = c.value(r);
          return typeof v === "number" ? v : null;
        }),
        c.heat
      );
    }
    return out;
  }, [rows, columns]);

  const cellText = (c: DataColumn<R>, r: R) => {
    const v = c.value(r);
    if (v == null) return "—";
    return typeof v === "number" ? (c.format ? c.format(v) : String(v)) : v;
  };

  const peerRows = isSubject ? rows.filter((r) => !isSubject(r)) : rows;
  const medians = columns.map((c) => {
    if (!c.heat || peerRows.length < 2) return null;
    const vals = peerRows.map((r) => c.value(r)).filter((v): v is number => typeof v === "number");
    return vals.length >= 2 ? median(vals) : null;
  });
  const hasHeat = columns.some((c) => c.heat);

  function csv(): string {
    return toCsv(
      columns.map((c) => (c.unit ? `${c.header} (${c.unit})` : c.header)),
      sorted.map((r) => columns.map((c) => (typeof c.value(r) === "number" ? (c.value(r) as number) : (c.value(r) as string | null)))),
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(csv());
      setStatus("Copied the table as CSV.");
    } catch {
      setStatus("Copy was blocked by the browser; use Download instead.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([csv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Downloaded.");
  }

  const th: React.CSSProperties = { padding: "0.55rem 0.75rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: VIZ.textSoft, background: VIZ.surface, borderBottom: `1px solid ${T.rule}`, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap", verticalAlign: "bottom" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
        <p style={{ margin: 0, fontSize: "0.74rem", color: VIZ.textSoft }}>
          {hasHeat ? "Shading shows where a value stands within its column: darker is better. " : ""}
          Click a heading to sort.
        </p>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {(["Copy CSV", "Download"] as const).map((t) => (
            <button key={t} type="button" onClick={t === "Copy CSV" ? copy : download} style={{ fontFamily: "inherit", fontSize: "0.74rem", padding: "0.25rem 0.7rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: "transparent", color: T.inkSoft, cursor: "pointer" }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div role="region" aria-label={ariaLabel} tabIndex={0} style={{ overflow: "auto", maxHeight: 460, border: `1px solid ${T.rule}`, borderRadius: 3, background: VIZ.surface }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.84rem" }}>
          <caption style={{ position: "absolute", left: -9999 }}>{ariaLabel}</caption>
          <thead>
            <tr>
              {columns.map((c, ci) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    style={{ ...th, textAlign: ci === 0 ? "left" : "right", left: ci === 0 ? 0 : undefined, zIndex: ci === 0 ? 3 : 2, position: "sticky" }}
                  >
                    <button
                      type="button"
                      onClick={() => setSort((cur) => nextSort(cur, c.key, c.natural ?? (ci === 0 ? "asc" : c.heat === "lower" ? "asc" : "desc")))}
                      style={{ all: "unset", cursor: "pointer", display: "inline-flex", flexDirection: "column", alignItems: ci === 0 ? "flex-start" : "flex-end", gap: 1 }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: active ? T.ink : VIZ.textSoft }}>
                        {c.header}
                        <motion.span aria-hidden="true" animate={{ rotate: active && sort!.dir === "asc" ? 180 : 0, opacity: active ? 1 : 0.35 }} transition={{ duration: MOTION.fast }} style={{ fontSize: "0.55rem", display: "inline-block" }}>
                          {"▼"}
                        </motion.span>
                      </span>
                      {c.unit && <span style={{ fontSize: "0.62rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{c.unit}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const subject = isSubject?.(r) ?? false;
              const origIndex = rows.indexOf(r);
              return (
                <motion.tr key={rowKey(r)} layout={reduce ? false : "position"} transition={MOTION.spring}>
                  {columns.map((c, ci) => {
                    const score = c.heat ? scores[c.key]?.[origIndex] ?? null : null;
                    const bg = score != null ? heatColor(score) : VIZ.surface;
                    return (
                      <td
                        key={c.key}
                        data-score={score ?? undefined}
                        style={{
                          padding: "0.55rem 0.75rem",
                          textAlign: ci === 0 ? "left" : "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: subject ? 600 : 400,
                          background: bg,
                          color: readableText(bg),
                          borderBottom: `1px solid ${VIZ.grid}`,
                          borderLeft: ci === 0 ? `3px solid ${subject ? VIZ.subject : "transparent"}` : undefined,
                          position: ci === 0 ? "sticky" : undefined,
                          left: ci === 0 ? 0 : undefined,
                          zIndex: ci === 0 ? 1 : undefined,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ci === 0 && subject && subjectLabel ? (
                          <>
                            {cellText(c, r)} <span style={{ fontSize: "0.62rem", fontWeight: 600, color: VIZ.subject, letterSpacing: "0.05em", textTransform: "uppercase", marginLeft: 4 }}>{subjectLabel}</span>
                          </>
                        ) : (
                          cellText(c, r)
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
            {medians.some((m) => m != null) && (
              <tr>
                {columns.map((c, ci) => (
                  <td key={c.key} style={{ padding: "0.55rem 0.75rem", textAlign: ci === 0 ? "left" : "right", fontVariantNumeric: "tabular-nums", fontStyle: "italic", color: VIZ.textSoft, background: VIZ.wash, borderTop: `1px solid ${T.rule}`, position: ci === 0 ? "sticky" : undefined, left: ci === 0 ? 0 : undefined, whiteSpace: "nowrap" }}>
                    {ci === 0 ? "Peer median" : medians[ci] != null ? (c.format ? c.format(medians[ci]!) : String(medians[ci])) : "—"}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(caption || status) && (
        <p style={{ margin: "0.6rem 0 0 0", fontSize: "0.74rem", color: VIZ.textSoft, lineHeight: 1.5 }}>
          {caption} <span role="status" aria-live="polite">{status}</span>
        </p>
      )}
    </div>
  );
}
