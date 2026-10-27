"use client";

// Sentinel viz - a change, with its arrow, its sign and its meaning in words. Colour carries "good or bad" only as a
// third channel: the arrow gives direction, the sign gives size, and the screen-reader text says it in full.

import { arrowFor, toneWords, type Tone } from "./semantics";
import { VIZ } from "./tokens";

const INK: Record<Tone, string> = { favorable: VIZ.favorableText, unfavorable: VIZ.unfavorableText, flat: VIZ.textSoft, neutral: VIZ.textSoft };
const WASH: Record<Tone, string> = { favorable: VIZ.favorableWash, unfavorable: VIZ.unfavorableWash, flat: VIZ.neutralWash, neutral: VIZ.neutralWash };

export function DeltaChip({ text, change, tone, vs, compact }: { text: string; change: number | null; tone: Tone; vs?: string; compact?: boolean }) {
  const arrow = arrowFor(change);
  const direction = arrow === "▲" ? "Up" : arrow === "▼" ? "Down" : "Unchanged";
  const words = toneWords(tone);
  return (
    <span
      aria-label={`${direction} ${text.replace(/^[+-]/, "")}${vs ? ` versus ${vs}` : ""}${words ? `, ${words}` : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: compact ? "transparent" : WASH[tone], color: INK[tone], borderRadius: 3, padding: compact ? 0 : "0.1rem 0.4rem", fontSize: compact ? "0.78rem" : "0.74rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
    >
      <span aria-hidden="true" style={{ fontSize: "0.6rem" }}>{arrow}</span>
      <span aria-hidden="true">{text}</span>
      {vs && <span aria-hidden="true" style={{ fontWeight: 400, color: VIZ.textSoft }}>vs {vs}</span>}
    </span>
  );
}
