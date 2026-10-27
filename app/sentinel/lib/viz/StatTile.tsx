"use client";

// Sentinel viz - a key figure: the value, how it moved, its shape over the years, and how it stands against the
// closest peer. The formula is one press away (an info button, not a hover-only title), so the number is never a
// black box. Tiles arrive in a short stagger; the figure itself is always present in the page text, never animated
// from zero, so what you copy or screenshot is what is true.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { T, SERIF } from "../theme";
import { DeltaChip } from "./DeltaChip";
import type { TileDelta } from "./delta";
import { Sparkline } from "./Sparkline";
import { MOTION, VIZ } from "./tokens";

export function StatTile({
  label,
  value,
  note,
  formula,
  delta,
  spark,
  sparkTitle,
  index = 0,
}: {
  label: string;
  value: string;
  note?: string | null;
  formula?: string;
  delta?: TileDelta | null;
  spark?: (number | null)[];
  sparkTitle?: string;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      data-stat={label}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.04, duration: MOTION.base, ease: MOTION.ease }}
      whileHover={reduce ? undefined : { backgroundColor: VIZ.wash }}
      style={{ background: T.card, padding: "1rem 1.1rem", display: "flex", flexDirection: "column", minHeight: 118 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
        <p data-stat-label style={{ fontSize: "0.74rem", color: T.inkSoft, margin: "0 0 0.35rem 0" }}>{label}</p>
        {formula && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`How is ${label} worked out?`}
            onClick={() => setOpen((o) => !o)}
            style={{ border: `1px solid ${open ? T.ink : T.rule}`, background: "transparent", color: open ? T.ink : T.inkSoft, borderRadius: "50%", width: 16, height: 16, fontSize: "0.62rem", lineHeight: 1, cursor: "pointer", flexShrink: 0, fontFamily: "inherit", padding: 0 }}
          >
            <span aria-hidden="true">i</span>
          </button>
        )}
      </div>
      <p data-stat-value style={{ fontFamily: SERIF, fontSize: "1.55rem", fontWeight: 500, color: T.ink, margin: 0, lineHeight: 1.15 }}>{value}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 0 }}>
          {delta && <DeltaChip text={delta.text} change={delta.change} tone={delta.tone} vs={delta.vs} />}
          {note && <p style={{ fontSize: "0.7rem", color: VIZ.textSoft, margin: 0 }}>{note}</p>}
        </div>
        {spark && spark.filter((v) => v != null).length >= 2 && <Sparkline values={spark} title={sparkTitle} />}
      </div>
      <AnimatePresence initial={false}>
        {open && formula && (
          <motion.p
            key="formula"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.base, ease: MOTION.ease }}
            style={{ overflow: "hidden", fontSize: "0.72rem", color: VIZ.textSoft, margin: "0.6rem 0 0 0", lineHeight: 1.5, borderTop: `1px solid ${T.rule}`, paddingTop: "0.5rem" }}
          >
            {formula}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
