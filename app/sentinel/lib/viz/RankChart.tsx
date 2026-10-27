"use client";

// Sentinel viz - the ranking chart: how a company stands among its peers on one measure, best first. Emphasis form:
// the company you are looking at is bronze, every peer a neutral grey, and the peer average is a hairline you can
// read each bar against. Rows are HTML so long names truncate with an ellipsis (never clipped by their own bar) and
// every row is focusable. Change the measure and the rows slide to their new places.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { ChartShell } from "./ChartShell";
import { ChartTooltip, TipNote, TipTitle } from "./ChartTooltip";
import { formatValue, type MetricKind } from "./format";
import { useElementWidth } from "./hooks";
import { ordinalRank } from "./rank";
import { mixHex } from "./peers";
import { MOTION, VIZ } from "./tokens";

export type RankRow = { id: string; label: string; value: number };

export function RankChart({
  rows,
  subjectId,
  kind,
  want = "higher",
  amountDecimals = 0,
  average,
  ariaLabel,
  caption,
  unitHeader = "",
}: {
  rows: RankRow[];
  subjectId: string;
  kind: MetricKind;
  want?: "higher" | "lower";
  amountDecimals?: number;
  /** The peer-set average on the same scale, drawn as a hairline. */
  average?: number | null;
  ariaLabel: string;
  caption?: string | null;
  unitHeader?: string;
}) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  if (rows.length === 0) return <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>No data for this metric.</p>;

  const ranked = ordinalRank(rows, want);
  const fmt = (v: number) => formatValue(kind, v, amountDecimals);
  const values = rows.map((r) => r.value);
  const lo = Math.min(0, ...values, average ?? 0);
  const hi = Math.max(0, ...values, average ?? 0);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);
  const hasNeg = lo < 0;
  const reserveRight = 78; // room for the value at the tip of the longest bar
  const reserveLeft = hasNeg ? 64 : 0;
  const labelCol = width < 420 ? 108 : 160;
  const rowH = 30;
  const barH = 14;
  const subjectRow = ranked.find((r) => r.id === subjectId);
  const hovered = hover ? ranked.find((r) => r.id === hover.id) : null;

  return (
    <ChartShell
      ariaLabel={ariaLabel}
      caption={caption}
      table={{
        head: ["Rank", unitHeader ? `Company (${unitHeader})` : "Company", "Value"],
        rows: ranked.map((r) => [String(r.rank), r.label, fmt(r.value)]),
        caption: `${ariaLabel}, best first`,
      }}
    >
      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
        <div role="list" aria-label={ariaLabel} style={{ position: "relative", paddingTop: average != null ? 20 : 0 }}>
          {ranked.map((r, i) => {
            const isSubject = r.id === subjectId;
            const active = hover?.id === r.id;
            const start = r.value >= 0 ? zero : pct(r.value);
            const w = Math.max(0.4, Math.abs(pct(r.value) - zero));
            const base = isSubject ? VIZ.subject : VIZ.context;
            const fill = active ? (isSubject ? mixHex(VIZ.subject, "#000000", 0.2) : VIZ.contextLine) : base;
            const dim = hover && !active && !isSubject ? 0.5 : 1; // the company you are viewing never fades
            return (
              <motion.div
                key={r.id}
                role="listitem"
                layout={reduce ? false : "position"}
                transition={MOTION.spring}
                tabIndex={0}
                aria-label={`${r.label}, rank ${r.rank} of ${ranked.length}, ${fmt(r.value)}${isSubject ? ", the company you are viewing" : ""}`}
                onPointerMove={(e) => {
                  const box = e.currentTarget.parentElement!.getBoundingClientRect();
                  setHover({ id: r.id, x: e.clientX - box.left, y: e.currentTarget.offsetTop });
                }}
                onPointerLeave={() => setHover(null)}
                onFocus={(e) => setHover({ id: r.id, x: labelCol + 60, y: e.currentTarget.offsetTop })}
                onBlur={() => setHover(null)}
                style={{ display: "grid", gridTemplateColumns: `22px ${labelCol}px 1fr`, alignItems: "center", height: rowH, outlineOffset: -2, cursor: "default", opacity: dim, transition: "opacity 120ms" }}
              >
                <span style={{ fontSize: "0.72rem", color: VIZ.textSoft, fontVariantNumeric: "tabular-nums" }} aria-hidden="true">{r.rank}</span>
                <span title={r.label} style={{ display: "flex", alignItems: "center", fontSize: "0.82rem", fontWeight: isSubject ? 600 : 400, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 10 }}>
                  {isSubject && <span aria-hidden="true" style={{ width: 6, height: 6, background: T.gold, transform: "rotate(45deg)", marginRight: 8, flexShrink: 0 }} />}
                  {r.label}
                </span>
                <span style={{ position: "relative", height: rowH, display: "block" }}>
                  <span style={{ position: "absolute", top: 0, bottom: 0, left: reserveLeft, right: reserveRight, display: "block" }}>
                    <motion.span
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${w}%`, background: fill }}
                      transition={{ width: { duration: MOTION.draw * 0.8, ease: MOTION.ease, delay: reduce ? 0 : i * MOTION.stagger }, background: { duration: MOTION.fast } }}
                      style={{ position: "absolute", top: (rowH - barH) / 2, height: barH, left: `${start}%`, background: base, borderRadius: r.value >= 0 ? "0 4px 4px 0" : "4px 0 0 4px" }}
                    />
                    <motion.span
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: reduce ? 0 : MOTION.draw * 0.5 + i * MOTION.stagger, duration: MOTION.base }}
                      style={{ position: "absolute", top: 0, height: rowH, lineHeight: `${rowH}px`, fontSize: "0.8rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: T.ink, whiteSpace: "nowrap", textShadow: `0 0 3px ${VIZ.surface}, 0 0 3px ${VIZ.surface}, 0 0 3px ${VIZ.surface}`, ...(r.value >= 0 ? { left: `calc(${pct(r.value)}% + 8px)` } : { right: `calc(${100 - pct(r.value)}% + 8px)` }) }}
                    >
                      {fmt(r.value)}
                    </motion.span>
                  </span>
                </span>
              </motion.div>
            );
          })}
          {/* the zero baseline, and the peer average as a hairline */}
          <span aria-hidden="true" style={{ position: "absolute", top: average != null ? 20 : 0, bottom: 0, left: 22 + labelCol, right: 0, pointerEvents: "none" }}>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: reserveLeft, right: reserveRight }}>
              <span style={{ position: "absolute", top: 0, bottom: 0, left: `${zero}%`, width: 1, background: VIZ.axis }} />
              {average != null && (
                <>
                  <span style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(average)}%`, width: 1, background: VIZ.ink, opacity: 0.55 }} />
                  <span style={{ position: "absolute", top: -17, left: `${pct(average)}%`, transform: "translateX(-50%)", fontSize: "0.7rem", color: VIZ.textSoft, whiteSpace: "nowrap" }}>Average {fmt(average)}</span>
                </>
              )}
            </span>
          </span>
        </div>
        <ChartTooltip show={!!hovered} x={hover?.x ?? 0} y={(hover?.y ?? 0) + (average != null ? 20 : 0) + 4} flip={(hover?.x ?? 0) > width * 0.6} width={190}>
          {hovered && (
            <>
              <TipTitle>{hovered.label}</TipTitle>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                <span style={{ color: VIZ.textSoft }}>Value</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hovered.value)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                <span style={{ color: VIZ.textSoft }}>Rank</span>
                <strong>{hovered.rank} of {ranked.length}</strong>
              </div>
              {average != null && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                  <span style={{ color: VIZ.textSoft }}>Against average</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{hovered.value - average >= 0 ? "+" : "-"}{fmt(Math.abs(hovered.value - average))}</strong>
                </div>
              )}
              {subjectRow && hovered.id !== subjectId && (
                <TipNote>{subjectRow.label} is {Math.abs(subjectRow.rank - hovered.rank)} place{Math.abs(subjectRow.rank - hovered.rank) === 1 ? "" : "s"} {subjectRow.rank < hovered.rank ? "ahead" : "behind"}.</TipNote>
              )}
            </>
          )}
        </ChartTooltip>
      </div>
    </ChartShell>
  );
}
