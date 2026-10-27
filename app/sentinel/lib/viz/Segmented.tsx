"use client";

// Sentinel viz - a small segmented control (radio group). The selected pill glides between options.

import { useId } from "react";
import { motion } from "framer-motion";
import { T } from "../theme";
import { MOTION } from "./tokens";

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
}) {
  const id = useId();
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => (e.currentTarget.parentElement?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus());
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ display: "inline-flex", border: `1px solid ${T.rule}`, borderRadius: 3, padding: 2, background: T.background, gap: 0 }}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: "0.74rem", fontWeight: active ? 600 : 500, padding: "0.28rem 0.7rem", borderRadius: 2, color: active ? T.background : T.inkSoft }}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={MOTION.spring}
                style={{ position: "absolute", inset: 0, background: T.ink, borderRadius: 2, zIndex: 0 }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
