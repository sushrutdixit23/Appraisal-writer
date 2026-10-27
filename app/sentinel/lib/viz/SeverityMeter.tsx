"use client";

// Sentinel viz - a four-step severity meter for the health rows: Critical, Concern, Watch, Healthy. The number of
// filled steps carries the level, so the meter reads in greyscale; the status is also written out beside it.

import { motion, useReducedMotion } from "framer-motion";
import { MOTION, VIZ } from "./tokens";

export function SeverityMeter({ level, color, label }: { level: 0 | 1 | 2 | 3 | 4; color: string; label: string }) {
  const reduce = useReducedMotion();
  return (
    <span role="img" aria-label={label} style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4].map((step) => (
        <motion.span
          key={step}
          initial={reduce ? false : { opacity: 0, scaleY: 0.3 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: reduce ? 0 : step * 0.06, duration: MOTION.base, ease: MOTION.ease }}
          style={{ width: 14, height: 6, borderRadius: 1, background: step <= level ? color : VIZ.grid, transformOrigin: "bottom" }}
        />
      ))}
    </span>
  );
}
