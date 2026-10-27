"use client";

// Sentinel viz - a part-to-whole bar (debt and equity). One stacked bar beats a pie for two or three parts: lengths
// compare, and a label can sit inside a segment when - and only when - it fits. A 2px gap of surface separates the
// segments; nothing is outlined. Hover lifts a segment, and the figures are in the legend and the table view.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { ChartShell } from "./ChartShell";
import { formatPercent, labelFits } from "./format";
import { useElementWidth } from "./hooks";
import { MOTION, VIZ } from "./tokens";

export type Segment = { id: string; label: string; value: number; color: string; display: string };

export function SplitBar({ segments, ariaLabel, caption, unitHeader = "" }: { segments: Segment[]; ariaLabel: string; caption?: string | null; unitHeader?: string }) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>No data for this selection.</p>;
  const gap = 2;
  const usable = width - gap * (segments.length - 1);

  return (
    <ChartShell
      ariaLabel={ariaLabel}
      caption={caption}
      legend={
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 1.1rem" }}>
          {segments.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: T.ink, fontWeight: hover === s.id ? 600 : 400 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, background: s.color, borderRadius: 1 }} />
              {s.label} <span style={{ color: VIZ.textSoft, fontVariantNumeric: "tabular-nums" }}>{s.display} ({formatPercent(Math.max(0, s.value) / total, 0)})</span>
            </span>
          ))}
        </div>
      }
      table={{ head: [unitHeader ? `Part (${unitHeader})` : "Part", "Amount", "Share"], rows: segments.map((s) => [s.label, s.display, formatPercent(Math.max(0, s.value) / total)]), caption: ariaLabel }}
    >
      <div ref={wrapRef} role="img" aria-label={`${ariaLabel}: ${segments.map((s) => `${s.label} ${formatPercent(Math.max(0, s.value) / total, 0)}`).join(", ")}`} style={{ display: "flex", gap, height: 30, width: "100%" }}>
        {segments.map((s, i) => {
          const share = Math.max(0, s.value) / total;
          const px = share * usable;
          const text = `${s.label} ${formatPercent(share, 0)}`;
          const fits = labelFits(text.length, 11.5, px, 8);
          return (
            <motion.div
              key={s.id}
              onPointerEnter={() => setHover(s.id)}
              onPointerLeave={() => setHover(null)}
              initial={reduce ? false : { flexGrow: 0, opacity: 0.6 }}
              animate={{ flexGrow: share, opacity: hover && hover !== s.id ? 0.55 : 1 }}
              transition={{ flexGrow: { duration: MOTION.draw * 0.8, ease: MOTION.ease, delay: reduce ? 0 : i * 0.08 }, opacity: { duration: MOTION.fast } }}
              title={`${s.label}: ${s.display} (${formatPercent(share, 1)})`}
              style={{ flexBasis: 0, minWidth: share > 0 ? 3 : 0, background: s.color, borderRadius: i === 0 ? "3px 0 0 3px" : i === segments.length - 1 ? "0 3px 3px 0" : 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}
            >
              {fits && <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#FFFFFF", whiteSpace: "nowrap" }}>{text}</span>}
            </motion.div>
          );
        })}
      </div>
    </ChartShell>
  );
}
