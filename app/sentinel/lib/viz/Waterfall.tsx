"use client";

// Sentinel viz - the profit bridge, drawn: revenue down to profit after tax, each step a floating column from where
// the running total was to where it is now. Totals are ink and rooted on zero; what adds is blue and what takes away
// is orange, with a sign on every label. It always ends on the reported profit: where the filing's own lines do not
// add up, the gap is a labelled step, and a step worked out from other lines is starred.

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { ChartShell } from "./ChartShell";
import { ChartTooltip, TipNote, TipTitle } from "./ChartTooltip";
import { formatAmount, formatPercent, formatSignedAmount, formatTick, wrapWords } from "./format";
import { bridgeBars, type Bridge } from "./bridge";
import { useElementWidth } from "./hooks";
import { linearScale, niceTicks } from "./scale";
import { MOTION, VIZ } from "./tokens";

export function Waterfall({ bridge, decimals = 0, ariaLabel, caption, unitHeader = "" }: { bridge: Bridge; decimals?: number; ariaLabel: string; caption?: string | null; unitHeader?: string }) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const [key, setKey] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const inside = useRef(false);

  const bars = bridgeBars(bridge.steps);
  const n = bars.length;
  const revenue = bars[0]?.value ?? 0;
  const levels = bars.flatMap((b) => [b.from, b.to]);
  const ticks = niceTicks(Math.min(...levels), Math.max(...levels), 5, true);
  const tickText = ticks.ticks.map((v) => formatTick("amount", v, ticks.decimals));
  const padL = Math.max(40, Math.max(...tickText.map((t) => t.length)) * 6.6 + 14);
  const padR = 10;
  const padT = 26;
  const padB = 56;
  const height = 300;
  const plotW = Math.max(120, width - padL - padR);
  const plotH = height - padT - padB;
  const y = linearScale(ticks.min, ticks.max, padT + plotH, padT);
  const band = plotW / n;
  const barW = Math.min(30, band * 0.58);
  const cx = (i: number) => padL + band * (i + 0.5);
  const idx = (key ?? hover) != null && (key ?? hover)! < n ? (key ?? hover)! : null;
  const fmtDelta = (v: number) => formatSignedAmount(v, decimals);
  const wrapAt = Math.max(7, Math.floor(band / 6.4));

  const colorOf = (b: (typeof bars)[number]) => (b.kind === "total" ? VIZ.total : b.value >= 0 ? VIZ.favorable : VIZ.unfavorable);

  function onKey(e: React.KeyboardEvent) {
    const cur = key ?? hover;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, (cur ?? -1) + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, (cur ?? n) - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setKey(null);
      setHover(null);
      setAnnounce("");
      return;
    } else return;
    e.preventDefault();
    setKey(next);
    const b = bars[next];
    setAnnounce(`${b.label}: ${b.kind === "total" ? formatAmount(b.value, decimals) : fmtDelta(b.value)}${b.kind === "delta" ? `, running total ${formatAmount(b.to, decimals)}` : ""}`);
  }

  const legend = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 1rem", fontSize: "0.76rem", color: VIZ.textSoft }}>
      {[
        { c: VIZ.total, t: "Total" },
        { c: VIZ.favorable, t: "Adds to profit" },
        { c: VIZ.unfavorable, t: "Takes away" },
      ].map((k) => (
        <span key={k.t} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, background: k.c, borderRadius: 1 }} />
          {k.t}
        </span>
      ))}
    </div>
  );

  const notes = [caption, bridge.steps.some((s) => s.implied) ? "* Worked out from the other lines, not read." : null, ...bridge.notes].filter(Boolean).join(" ");

  return (
    <ChartShell
      ariaLabel={ariaLabel}
      caption={notes}
      legend={legend}
      table={{
        head: [unitHeader ? `Step (${unitHeader})` : "Step", "Amount", "Share of revenue", "Running total"],
        rows: bars.map((b) => [
          b.label + (b.implied ? " (worked out)" : ""),
          b.kind === "total" ? formatAmount(b.value, decimals) : fmtDelta(b.value),
          revenue ? formatPercent(b.value / revenue) : null,
          formatAmount(b.to, decimals),
        ]),
        caption: `${ariaLabel}, step by step`,
      }}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read each step.`}
        onKeyDown={onKey}
        onBlur={() => {
          setKey(null);
          if (!inside.current) setHover(null);
        }}
        style={{ position: "relative", width: "100%", outlineOffset: 3 }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} onPointerMove={(e) => {
            inside.current = true;
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.floor((e.clientX - r.left - padL) / band);
            setKey(null);
            setHover(i >= 0 && i < n ? i : null);
          }}
          onPointerLeave={() => { inside.current = false; setHover(null); }}
          style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}>
          {ticks.ticks.map((t, k) => (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
              <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={VIZ.textSoft} style={{ fontVariantNumeric: "tabular-nums" }}>{tickText[k]}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const top = Math.min(y(b.from), y(b.to));
            const h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
            const active = idx === i;
            const dim = idx != null && !active;
            const label = b.kind === "total" ? formatAmount(b.value, decimals) : fmtDelta(b.value);
            const above = b.kind === "total" ? b.value >= 0 : b.value >= 0;
            const lines = wrapWords(b.label + (b.implied ? "*" : ""), wrapAt);
            return (
              <g key={b.id}>
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH + padB - 6}
                  fill={active ? VIZ.wash : "transparent"}
                />
                {i < n - 1 && (
                  <motion.line x1={cx(i) + barW / 2} x2={cx(i + 1) - barW / 2} y1={y(b.to)} y2={y(b.to)} stroke={VIZ.axis} strokeWidth={1} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : (i + 1) * MOTION.stagger * 2, duration: MOTION.base }} />
                )}
                <motion.rect
                  x={cx(i) - barW / 2}
                  width={barW}
                  rx={2}
                  fill={colorOf(b)}
                  initial={reduce ? false : { y: b.kind === "total" ? y(0) : y(b.from), height: 0, opacity: 0.9 }}
                  animate={{ y: top, height: h, opacity: dim ? 0.45 : 1 }}
                  transition={{ y: { duration: MOTION.draw * 0.7, ease: MOTION.ease, delay: reduce ? 0 : i * MOTION.stagger * 2 }, height: { duration: MOTION.draw * 0.7, ease: MOTION.ease, delay: reduce ? 0 : i * MOTION.stagger * 2 }, opacity: { duration: MOTION.fast } }}
                />
                <motion.text
                  x={cx(i)}
                  y={above ? top - 7 : top + h + 14}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={600}
                  fill={T.ink}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: dim ? 0.4 : 1 }}
                  transition={{ delay: reduce ? 0 : MOTION.draw * 0.5 + i * MOTION.stagger * 2, duration: MOTION.base }}
                >
                  {label}
                </motion.text>
                <text textAnchor="middle" fontSize={11} fill={active ? T.ink : VIZ.textSoft} fontWeight={active ? 600 : 400}>
                  {lines.map((l, k) => (
                    <tspan key={k} x={cx(i)} y={height - padB + 20 + k * 13}>{l}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip show={idx != null} x={idx != null ? cx(idx) : 0} y={padT} flip={idx != null && cx(idx) > width * 0.55} width={200}>
          {idx != null && (
            <>
              <TipTitle>{bars[idx].label}{bars[idx].implied ? " (worked out)" : ""}</TipTitle>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                <span style={{ color: VIZ.textSoft }}>{bars[idx].kind === "total" ? "Amount" : "Change"}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{bars[idx].kind === "total" ? formatAmount(bars[idx].value, decimals) : fmtDelta(bars[idx].value)}</strong>
              </div>
              {revenue ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                  <span style={{ color: VIZ.textSoft }}>Share of revenue</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatPercent(bars[idx].value / revenue)}</strong>
                </div>
              ) : null}
              {bars[idx].kind === "delta" && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                  <span style={{ color: VIZ.textSoft }}>Running total</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatAmount(bars[idx].to, decimals)}</strong>
                </div>
              )}
              {bars[idx].note && <TipNote>{bars[idx].note}</TipNote>}
            </>
          )}
        </ChartTooltip>
        <div role="status" aria-live="polite" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>{announce}</div>
      </div>
    </ChartShell>
  );
}
