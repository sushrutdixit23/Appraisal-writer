"use client";

// Sentinel viz - the floating readout. HTML, not SVG, so text wraps and styles normally. Everything it shows is also
// in the chart's table view and (for the focused point) in the screen-reader announcement: a tooltip enhances, it
// never gates.

import { AnimatePresence, motion } from "framer-motion";
import { T } from "../theme";
import { MOTION, VIZ } from "./tokens";

export function ChartTooltip({ show, x, y, flip, children, width = 190 }: { show: boolean; x: number; y: number; flip: boolean; children: React.ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {show && (
        <div
          key="tip"
          style={{ position: "absolute", left: x, top: y, transform: `translateX(${flip ? `calc(-100% - 14px)` : "14px"})`, pointerEvents: "none", zIndex: 6 }}
        >
          <motion.div
            data-testid="chart-tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.fast, ease: MOTION.ease }}
            style={{ minWidth: width, maxWidth: 280, background: VIZ.surface, border: `1px solid ${T.rule}`, borderRadius: 3, boxShadow: "0 8px 24px rgba(22,22,22,0.12)", padding: "0.55rem 0.7rem", fontSize: "0.76rem", color: T.ink, lineHeight: 1.45 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function TipTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 0.35rem 0", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: VIZ.textSoft }}>{children}</p>;
}

/** One row: a short line-key in the series colour, the NAME in secondary ink, the VALUE strong on the right. */
export function TipRow({ color, name, value, strong, keyShape = "line" }: { color: string; name: string; value: string; strong?: boolean; keyShape?: "line" | "box" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between", padding: "0.1rem 0" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", minWidth: 0, color: strong ? T.ink : VIZ.textSoft, fontWeight: strong ? 600 : 400 }}>
        <span aria-hidden="true" style={{ width: keyShape === "line" ? 12 : 8, height: keyShape === "line" ? 2 : 8, background: color, flexShrink: 0, borderRadius: keyShape === "box" ? 1 : 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: T.ink }}>{value}</span>
    </div>
  );
}

export function TipNote({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.7rem", color: VIZ.textSoft }}>{children}</p>;
}
