"use client";

// Sentinel viz - a sparkline: the shape of a series in a tile or a table row, nothing else. It carries no numbers
// (the figure beside it does), so it is hidden from screen readers and given a title for sighted hover.

import { motion, useReducedMotion } from "framer-motion";
import { linearScale } from "./scale";
import { MOTION, VIZ } from "./tokens";

export function Sparkline({ values, width = 84, height = 26, color = VIZ.subject, title }: { values: (number | null)[]; width?: number; height?: number; color?: string; title?: string }) {
  const reduce = useReducedMotion();
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return <span aria-hidden="true" style={{ display: "inline-block", width, height }} />;
  const pad = 4;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const x = linearScale(0, values.length - 1, pad, width - pad);
  const y = linearScale(lo, hi === lo ? lo + 1 : hi, height - pad, pad);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" style={{ display: "block", overflow: "visible" }}>
      {title && <title>{title}</title>}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: MOTION.draw * 0.7, ease: MOTION.ease }}
      />
      <motion.circle
        cx={x(last.i)}
        cy={y(last.v)}
        r={3.2}
        fill={color}
        stroke={VIZ.surface}
        strokeWidth={2}
        initial={reduce ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: MOTION.draw * 0.6, duration: MOTION.base, ease: MOTION.ease }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}
