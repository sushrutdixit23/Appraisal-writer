"use client";

// Sentinel viz - the column chart: one measure across periods, anchored on zero. This is the honest form for an
// amount over years (revenue, profit): length is the value, so a drop to a loss is visibly below the line, and the
// year-on-year change is in the tooltip and the table rather than drawn as a second axis. Columns are thin, rounded
// only at the data end, and grow up from the baseline. A loss hangs below it in the unfavourable colour.

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { ChartShell } from "./ChartShell";
import { ChartTooltip, TipNote, TipTitle } from "./ChartTooltip";
import { DeltaChip } from "./DeltaChip";
import { formatSignedPercent, formatTick, formatValue, type MetricKind } from "./format";
import { columnPath } from "./geometry";
import { useElementWidth } from "./hooks";
import { linearScale, niceTicks } from "./scale";
import { cagr, deltaTone, pctChange, yearsBetween } from "./semantics";
import { MOTION, VIZ } from "./tokens";

export type Column = { label: string; value: number | null; date?: string };

export function ColumnChart({
  data,
  kind = "amount",
  amountDecimals = 0,
  height = 250,
  ariaLabel,
  caption,
  unitHeader = "",
  seriesLabel = "Value",
}: {
  data: Column[];
  kind?: MetricKind;
  amountDecimals?: number;
  height?: number;
  ariaLabel: string;
  caption?: string | null;
  unitHeader?: string;
  seriesLabel?: string;
}) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);
  const [key, setKey] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const inside = useRef(false);

  const n = data.length;
  const present = data.filter((d) => d.value != null && Number.isFinite(d.value)) as (Column & { value: number })[];
  if (n === 0 || present.length === 0) return <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>No data for this selection.</p>;

  const vals = present.map((d) => d.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 5, true);
  const tickText = ticks.ticks.map((v) => formatTick(kind, v, ticks.decimals));
  const padL = Math.max(38, Math.max(...tickText.map((t) => t.length)) * 6.6 + 14);
  const padR = 12;
  const padT = 24;
  const padB = 28;
  const plotW = Math.max(60, width - padL - padR);
  const plotH = height - padT - padB;
  const y = linearScale(ticks.min, ticks.max, padT + plotH, padT);
  const zeroY = y(0);
  const band = plotW / n;
  const barW = Math.min(28, band * 0.5);
  const cx = (i: number) => padL + band * (i + 0.5);

  const idx = (key ?? hover) != null && (key ?? hover)! < n ? (key ?? hover)! : null;
  const fmt = (v: number) => formatValue(kind, v, amountDecimals);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  // A value on every column is fine for a handful of annual columns; past six, label only the ends and the extremes.
  const labelled = (i: number) => {
    const v = data[i].value;
    if (v == null) return false;
    if (n <= 6) return true;
    return i === 0 || i === n - 1 || v === maxV || v === minV;
  };

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    inside.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - padL) / band);
    setKey(null);
    setHover(i >= 0 && i < n ? i : null);
  }
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
    const v = data[next].value;
    setAnnounce(`${data[next].label}: ${v == null ? "no figure" : fmt(v)}`);
  }

  const now = idx != null ? data[idx].value : null;
  const before = idx != null && idx > 0 ? data[idx - 1].value : null;
  const change = kind === "amount" ? pctChange(now, before) : null;
  const tone = deltaTone(change, "higher");

  let summary: string | null = null;
  if (present.length >= 2) {
    const a = present[0];
    const b = present[present.length - 1];
    summary = `${seriesLabel}: ${fmt(a.value)} in ${a.label} to ${fmt(b.value)} in ${b.label}`;
    if (kind === "amount" && a.date && b.date && yearsBetween(a.date, b.date) >= 2) {
      const g = cagr(a.value, b.value, yearsBetween(a.date, b.date));
      if (g != null) summary += `, a compound annual growth of ${formatSignedPercent(g)}`;
    }
    summary += ".";
  }

  const tableRows = data.map((d, i) => {
    const c = kind === "amount" && i > 0 ? pctChange(d.value, data[i - 1].value) : null;
    return [d.label, d.value == null ? null : fmt(d.value), c == null ? null : formatSignedPercent(c)];
  });

  return (
    <ChartShell
      ariaLabel={ariaLabel}
      caption={[caption, summary].filter(Boolean).join(" ")}
      table={{ head: [unitHeader ? `Period (${unitHeader})` : "Period", seriesLabel, ...(kind === "amount" ? ["Change on prior period"] : [])], rows: kind === "amount" ? tableRows : tableRows.map((r) => r.slice(0, 2)), caption: `${ariaLabel}, by period` }}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read each period.`}
        onKeyDown={onKey}
        onBlur={() => {
          setKey(null);
          if (!inside.current) setHover(null);
        }}
        style={{ position: "relative", width: "100%", outlineOffset: 3 }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary ?? ariaLabel} onPointerMove={onMove} onPointerLeave={() => { inside.current = false; setHover(null); }} style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}>
          {ticks.ticks.map((t, k) => (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
              <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={VIZ.textSoft} style={{ fontVariantNumeric: "tabular-nums" }}>{tickText[k]}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const v = d.value;
            const x = cx(i) - barW / 2;
            const active = idx === i;
            const dim = idx != null && !active;
            return (
              <g key={d.label + i}>
                {/* the whole band is the hit area, bigger than the mark */}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill={active ? VIZ.wash : "transparent"} />
                {v != null && (
                  <motion.path
                    d={columnPath(x, zeroY, barW, Math.abs(y(v) - zeroY), 4, v >= 0 ? 1 : -1)}
                    fill={v >= 0 ? VIZ.subject : VIZ.unfavorable}
                    initial={reduce ? false : { d: columnPath(x, zeroY, barW, 0, 4, v >= 0 ? 1 : -1), opacity: 0.9 }}
                    animate={{ d: columnPath(x, zeroY, barW, Math.abs(y(v) - zeroY), 4, v >= 0 ? 1 : -1), opacity: dim ? 0.45 : 1 }}
                    transition={{ d: { duration: MOTION.draw * 0.8, ease: MOTION.ease, delay: reduce ? 0 : i * MOTION.stagger }, opacity: { duration: MOTION.fast } }}
                  />
                )}
                {labelled(i) && v != null && (
                  <motion.text
                    x={cx(i)}
                    y={v >= 0 ? y(v) - 7 : y(v) + 15}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={600}
                    fill={T.ink}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: dim ? 0.4 : 1 }}
                    transition={{ delay: reduce ? 0 : MOTION.draw * 0.6 + i * MOTION.stagger, duration: MOTION.base }}
                  >
                    {fmt(v)}
                  </motion.text>
                )}
                <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={active ? T.ink : VIZ.textSoft} fontWeight={active ? 600 : 400}>{d.label}</text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip show={idx != null} x={idx != null ? cx(idx) : 0} y={padT} flip={idx != null && cx(idx) > width * 0.55} width={170}>
          {idx != null && (
            <>
              <TipTitle>{data[idx].label}</TipTitle>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem" }}>
                <span style={{ color: VIZ.textSoft }}>{seriesLabel}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{now == null ? "—" : fmt(now)}</strong>
              </div>
              {change != null && tone && (
                <div style={{ marginTop: "0.4rem" }}>
                  <DeltaChip text={formatSignedPercent(change)} change={change} tone={tone} vs={data[idx - 1].label} />
                </div>
              )}
              {now == null && <TipNote>No figure on file for this period.</TipNote>}
            </>
          )}
        </ChartTooltip>
        <div role="status" aria-live="polite" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>{announce}</div>
      </div>
    </ChartShell>
  );
}
