"use client";

// Sentinel viz - the line chart. Built for the question Sentinel actually asks: "how is THIS company doing against
// its peers over time?" So it is an emphasis chart: the company you are looking at is drawn in bronze, in front and
// named at its end; the peers are neutral greys behind it. Colour follows the entity, not its rank, so filtering a
// peer out never repaints the others.
//
//   hover / touch   a crosshair snaps to the nearest period; one tooltip lists EVERY series at that period, with the
//                   company's change on the period before; the line nearest the pointer is picked out
//   legend          each peer is a button: press one to compare the company against just that peer
//   Each peer | Peer range   with three or more peers, the spread (min to max) and the median can replace the lines
//   keyboard        Tab to the chart, Left and Right step through the periods, Home and End jump, Esc lets go;
//                   what is under the cursor is announced
//   Chart | Table   the same numbers as text
//   gaps            a missing period is a gap in the line, never an interpolated one

import { useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { T } from "../theme";
import { ChartShell } from "./ChartShell";
import { ChartTooltip, TipNote, TipRow, TipTitle } from "./ChartTooltip";
import { DeltaChip } from "./DeltaChip";
import { formatPoints, formatSignedPercent, formatTick, formatValue, type MetricKind } from "./format";
import { useElementWidth } from "./hooks";
import { Segmented } from "./Segmented";
import { labelStep, linearScale, lineDomain, nearestIndex } from "./scale";
import { cagr, deltaTone, pctChange, pointChange, yearsBetween } from "./semantics";
import { peerBand } from "./peers";
import { MOTION, VIZ } from "./tokens";

export type LineSeries = {
  id: string;
  label: string;
  values: (number | null)[];
  /** The company you are looking at: bronze, in front, named at its end. */
  subject?: boolean;
  /** A second measure of the SAME company (margins): steel blue, also in front. Peers never get a colour. */
  secondary?: boolean;
};

type Mode = "lines" | "band";

/** Runs of consecutive present values, as [index, value] pairs. A gap ends a run. */
function runs(values: (number | null)[]): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([i, v]);
  });
  if (cur.length) out.push(cur);
  return out;
}

export function LineChart({
  xLabels,
  xDates,
  series,
  kind,
  amountDecimals = 0,
  height = 290,
  ariaLabel,
  caption,
  unitHeader = "",
  area = false,
}: {
  xLabels: string[];
  /** ISO period-end dates, one per label: lets the chart state a compound annual growth rate. */
  xDates?: string[];
  series: LineSeries[];
  kind: MetricKind;
  amountDecimals?: number;
  height?: number;
  ariaLabel: string;
  caption?: string | null;
  /** Shown on the table view's first column. */
  unitHeader?: string;
  area?: boolean;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(640);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [keyIdx, setKeyIdx] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("lines");
  const [announce, setAnnounce] = useState("");
  const pointerInside = useRef(false);

  const n = xLabels.length;
  const subject = series.find((s) => s.subject) ?? (series.length === 1 ? series[0] : null);
  const secondaries = series.filter((s) => s.secondary && s !== subject);
  const featured = [...(subject ? [subject] : []), ...secondaries];
  const peers = series.filter((s) => !featured.includes(s));
  const colorOf = (s: LineSeries) => (s === subject ? VIZ.subject : s.secondary ? VIZ.secondary : peerPicked(s.id) ? VIZ.ink : VIZ.contextLine);
  const bandAvailable = peers.length >= 3;
  const useBand = bandAvailable && mode === "band";
  const band = useMemo(() => peerBand(peers.map((s) => ({ id: s.id, values: s.values })), "", n), [peers, n]);

  // Everything the axis must hold.
  const domainValues: number[] = [];
  const addAll = (vals: (number | null)[]) => vals.forEach((v) => v != null && Number.isFinite(v) && domainValues.push(v));
  featured.forEach((f) => addAll(f.values));
  if (useBand) {
    addAll(band.min);
    addAll(band.max);
  } else peers.forEach((p) => addAll(p.values));

  if (n === 0 || domainValues.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>No data for this selection.</p>;
  }

  const ticks = lineDomain(domainValues, height < 240 ? 4 : 5);
  const tickText = ticks.ticks.map((v) => formatTick(kind, v, ticks.decimals));
  const padL = Math.max(38, Math.max(...tickText.map((t) => t.length)) * 6.6 + 14);
  const padR = 18;
  const padT = 26;
  const padB = 28;
  const plotW = Math.max(60, width - padL - padR);
  const plotH = height - padT - padB;
  const xs = xLabels.map((_, i) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW));
  const y = linearScale(ticks.min, ticks.max, padT + plotH, padT);
  const baselineY = y(Math.max(ticks.min, Math.min(0, ticks.max)));
  const every = labelStep(n, plotW, 66);

  const idx = (keyIdx ?? hoverIdx) != null && (keyIdx ?? hoverIdx)! < n ? (keyIdx ?? hoverIdx)! : null;

  const fmt = (v: number) => formatValue(kind, v, amountDecimals);
  const path = (run: [number, number][]) => run.map(([i, v], k) => `${k === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  function emphasis(id: string): number {
    if (featured.some((f) => f.id === id)) return 1;
    if (isolate) return id === isolate ? 1 : 0.16;
    if (focusId) return id === focusId ? 1 : 0.4;
    return 0.95;
  }
  const peerPicked = (id: string) => id === isolate || (!isolate && id === focusId);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    pointerInside.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const i = nearestIndex(xs, px);
    setKeyIdx(null);
    setHoverIdx(i);
    let best: { id: string; d: number } | null = null;
    for (const p of useBand ? [] : peers) {
      const v = p.values[i];
      if (v == null) continue;
      const d = Math.abs(y(v) - py);
      if (!best || d < best.d) best = { id: p.id, d };
    }
    setFocusId(best && best.d < 36 ? best.id : null);
  }
  function onLeave() {
    pointerInside.current = false;
    setHoverIdx(null);
    setFocusId(null);
  }
  function describe(i: number): string {
    const parts = (useBand ? featured : series).map((s) => (s && s.values[i] != null ? `${s.label} ${fmt(s.values[i]!)}` : null)).filter(Boolean);
    if (useBand && band.median[i] != null) parts.push(`Peer median ${fmt(band.median[i]!)}`);
    return `${xLabels[i]}: ${parts.join(", ")}`;
  }
  function onKey(e: React.KeyboardEvent) {
    let next: number | null = null;
    const cur = keyIdx ?? hoverIdx;
    if (e.key === "ArrowRight") next = Math.min(n - 1, (cur ?? -1) + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, (cur ?? n) - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setKeyIdx(null);
      setHoverIdx(null);
      setAnnounce("");
      return;
    } else return;
    e.preventDefault();
    setKeyIdx(next);
    setAnnounce(describe(next));
  }

  // Tooltip rows at idx.
  type Row = { id: string; name: string; value: number; color: string; strong: boolean };
  const rows: Row[] = [];
  if (idx != null) {
    for (const s of series) {
      const v = s.values[idx];
      if (v == null) continue;
      if (useBand && !featured.includes(s)) continue;
      rows.push({ id: s.id, name: s.label, value: v, color: colorOf(s), strong: featured.includes(s) || peerPicked(s.id) });
    }
    rows.sort((a, b) => b.value - a.value);
  }
  const subjectNow = idx != null && subject ? subject.values[idx] : null;
  const subjectBefore = idx != null && idx > 0 && subject ? subject.values[idx - 1] : null;
  const change = kind === "amount" ? pctChange(subjectNow, subjectBefore) : kind === "percent" ? pointChange(subjectNow, subjectBefore) : null;
  const changeText = change == null ? null : kind === "amount" ? formatSignedPercent(change) : formatPoints(change);
  const changeTone = kind === "multiple" || kind === "days" ? null : deltaTone(change, "higher");

  const showAllMarkers = n <= 12;

  // A one-line summary of the subject's journey, with CAGR for amounts.
  let summary: string | null = null;
  if (subject) {
    const present = subject.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
    if (present.length >= 2) {
      const a = present[0];
      const b = present[present.length - 1];
      summary = `${subject.label}: ${fmt(a.v)} in ${xLabels[a.i]} to ${fmt(b.v)} in ${xLabels[b.i]}`;
      if (kind === "amount" && xDates?.[a.i] && xDates?.[b.i]) {
        const g = cagr(a.v, b.v, yearsBetween(xDates[a.i], xDates[b.i]));
        if (g != null && yearsBetween(xDates[a.i], xDates[b.i]) >= 2) summary += `, a compound annual growth of ${formatSignedPercent(g)}`;
      }
      summary += ".";
    }
  }

  const drawDelay = (k: number) => (reduce ? 0 : 0.15 + k * 0.08);
  const orderedForTable = [...featured, ...peers];
  const tableHead = [unitHeader ? `Period (${unitHeader})` : "Period", ...orderedForTable.map((p) => p.label)];
  const tableRows = xLabels.map((l, i) => [l, ...orderedForTable.map((s) => (s.values[i] == null ? null : fmt(s.values[i]!)))]);

  const controls = bandAvailable ? (
    <Segmented
      ariaLabel="Show peers as"
      value={mode}
      onChange={(m: Mode) => {
        setMode(m);
        setIsolate(null);
        setFocusId(null);
      }}
      options={[
        { value: "lines", label: "Each peer" },
        { value: "band", label: "Peer range" },
      ]}
    />
  ) : null;

  const legend =
    series.length >= 2 ? (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.9rem" }}>
        {featured.map((f) => (
          <LegendKey key={f.id} color={colorOf(f)} label={f.label} bold />
        ))}
        {useBand ? (
          <>
            <LegendKey color={VIZ.contextLine} label="Peer median" />
            <LegendKey color={VIZ.context} label="Peer range (low to high)" box />
          </>
        ) : (
          peers.map((p) => (
            <LegendKey
              key={p.id}
              color={isolate === p.id ? VIZ.ink : VIZ.contextLine}
              label={p.label}
              pressed={isolate === p.id}
              onToggle={() => setIsolate((cur) => (cur === p.id ? null : p.id))}
              onHover={(on) => setFocusId(on ? p.id : null)}
            />
          ))
        )}
      </div>
    ) : null;

  return (
    <ChartShell
      ariaLabel={ariaLabel}
      caption={[caption, summary].filter(Boolean).join(" ")}
      controls={controls}
      legend={legend}
      table={{ head: tableHead, rows: tableRows, caption: `${ariaLabel}, by period` }}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read each period.`}
        onKeyDown={onKey}
        onBlur={() => {
          setKeyIdx(null);
          if (!pointerInside.current) setHoverIdx(null);
        }}
        style={{ position: "relative", width: "100%", outlineOffset: 3 }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary ?? ariaLabel} onPointerMove={onMove} onPointerLeave={onLeave} style={{ display: "block", touchAction: "pan-y", overflow: "visible" }}>
          {/* grid: horizontal hairlines only, one step off the surface */}
          {ticks.ticks.map((t, k) => (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 && ticks.min < 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
              <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={VIZ.textSoft} style={{ fontVariantNumeric: "tabular-nums" }}>
                {tickText[k]}
              </text>
            </g>
          ))}
          {xLabels.map((l, i) =>
            (n - 1 - i) % every === 0 ? (
              <text key={l + i} x={xs[i]} y={height - 8} textAnchor="middle" fontSize={11} fill={i === idx ? T.ink : VIZ.textSoft} fontWeight={i === idx ? 600 : 400}>
                {l}
              </text>
            ) : null
          )}

          {/* peer range band + median */}
          {useBand && (
            <g>
              {runs(band.min.map((v, i) => (v != null && band.max[i] != null ? v : null))).map((run, k) => {
                const top = run.map(([i]) => `${xs[i].toFixed(1)} ${y(band.max[i]!).toFixed(1)}`);
                const bottom = [...run].reverse().map(([i]) => `${xs[i].toFixed(1)} ${y(band.min[i]!).toFixed(1)}`);
                return (
                  <motion.path key={k} d={`M${top.join(" L")} L${bottom.join(" L")} Z`} fill={VIZ.context} stroke="none" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.35 }} transition={{ duration: MOTION.base }} />
                );
              })}
              {runs(band.median).map((run, k) => (
                <motion.path key={k} d={path(run)} fill="none" stroke={VIZ.contextLine} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: MOTION.draw, ease: MOTION.ease }} />
              ))}
            </g>
          )}

          {/* peers: quiet, behind */}
          {!useBand &&
            peers.map((p, pk) =>
              runs(p.values).map((run, k) => (
                <motion.path
                  key={`${uid}${p.id}${k}`}
                  d={path(run)}
                  fill="none"
                  stroke={peerPicked(p.id) ? VIZ.ink : VIZ.contextLine}
                  strokeWidth={peerPicked(p.id) ? 2 : 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: emphasis(p.id) }}
                  transition={{ pathLength: { duration: MOTION.draw, ease: MOTION.ease, delay: drawDelay(pk) }, opacity: { duration: MOTION.base } }}
                />
              ))
            )}

          {/* the company's own series, in front: area wash, line, markers, then the direct label at the end */}
          {featured.map((f, fk) => {
            const color = colorOf(f);
            const fruns = runs(f.values);
            const endPoint = fruns.length ? fruns[fruns.length - 1][fruns[fruns.length - 1].length - 1] : null;
            return (
              <g key={f.id}>
                {(area || series.length === 1) && f === subject &&
                  fruns.map((run, k) =>
                    run.length < 2 ? null : (
                      <motion.path key={`a${k}`} d={`${path(run)} L${xs[run[run.length - 1][0]].toFixed(1)} ${baselineY.toFixed(1)} L${xs[run[0][0]].toFixed(1)} ${baselineY.toFixed(1)} Z`} fill={color} stroke="none" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ delay: reduce ? 0 : MOTION.draw * 0.6, duration: MOTION.base }} />
                    )
                  )}
                {fruns.map((run, k) =>
                  run.length < 2 ? null : (
                    <motion.path key={`s${k}`} d={path(run)} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: MOTION.draw, ease: MOTION.ease, delay: drawDelay(peers.length + fk) }} />
                  )
                )}
                {f.values.map((v, i) =>
                  v == null || !(showAllMarkers || (endPoint && i === endPoint[0])) ? null : (
                    <motion.circle key={`m${i}`} cx={xs[i]} cy={y(v)} r={4} fill={color} stroke={VIZ.surface} strokeWidth={2} initial={reduce ? false : { opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduce ? 0 : drawDelay(peers.length + fk) + MOTION.draw * 0.6 + i * 0.03, duration: MOTION.base, ease: MOTION.ease }} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                  )
                )}
                {endPoint && idx == null && (() => {
                  // Name the line where it ends. If two featured lines end close together, the lower one's label goes below its point.
                  const others = featured.filter((o) => o !== f).map((o) => { const r = runs(o.values); return r.length ? r[r.length - 1][r[r.length - 1].length - 1] : null; });
                  const crowded = others.some((o) => o && Math.abs(y(o[1]) - y(endPoint[1])) < 16 && y(o[1]) < y(endPoint[1]));
                  const above = y(endPoint[1]) - 12 >= 14 && !crowded;
                  return (
                    <text x={Math.min(xs[endPoint[0]], padL + plotW)} y={above ? y(endPoint[1]) - 12 : y(endPoint[1]) + 20} textAnchor="end" fontSize={11.5} fontWeight={600} fill={T.ink} stroke={VIZ.surface} strokeWidth={3} paintOrder="stroke">
                      {f.label} {fmt(endPoint[1])}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* crosshair + dots on every visible series at the chosen period */}
          {idx != null && (
            <g pointerEvents="none">
              <motion.line initial={false} animate={{ x1: xs[idx], x2: xs[idx] }} transition={{ duration: 0.08 }} y1={padT} y2={padT + plotH} stroke={VIZ.axis} strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[idx];
                if (v == null || (useBand && !featured.includes(s))) return null;
                return <circle key={s.id} cx={xs[idx]} cy={y(v)} r={4} fill={colorOf(s)} stroke={VIZ.surface} strokeWidth={2} opacity={featured.includes(s) ? 1 : emphasis(s.id) < 0.5 ? 0.4 : 1} />;
              })}
              {useBand && band.median[idx] != null && <circle cx={xs[idx]} cy={y(band.median[idx]!)} r={4} fill={VIZ.contextLine} stroke={VIZ.surface} strokeWidth={2} />}
            </g>
          )}
        </svg>

        <ChartTooltip show={idx != null} x={idx != null ? xs[idx] : 0} y={padT + 2} flip={idx != null && xs[idx] > width * 0.55}>
          {idx != null && (
            <>
              <TipTitle>{xLabels[idx]}</TipTitle>
              {rows.map((r) => (
                <TipRow key={r.id} color={r.color} name={r.name} value={fmt(r.value)} strong={r.strong} />
              ))}
              {useBand && band.median[idx] != null && <TipRow color={VIZ.contextLine} name="Peer median" value={fmt(band.median[idx]!)} />}
              {useBand && band.min[idx] != null && <TipRow color={VIZ.context} name="Peer range" value={`${fmt(band.min[idx]!)} to ${fmt(band.max[idx]!)}`} keyShape="box" />}
              {useBand && band.n[idx] > 0 && <TipNote>{band.n[idx]} peer{band.n[idx] === 1 ? "" : "s"} with data</TipNote>}
              {changeText && changeTone && (
                <div style={{ marginTop: "0.4rem" }}>
                  <DeltaChip text={changeText} change={change} tone={changeTone} vs={xLabels[idx - 1]} />
                </div>
              )}
            </>
          )}
        </ChartTooltip>
        <div role="status" aria-live="polite" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>{announce}</div>
      </div>
    </ChartShell>
  );
}

function LegendKey({ color, label, bold, box, pressed, onToggle, onHover }: { color: string; label: string; bold?: boolean; box?: boolean; pressed?: boolean; onToggle?: () => void; onHover?: (on: boolean) => void }) {
  const key = <span aria-hidden="true" style={{ width: box ? 10 : 14, height: box ? 10 : 2.5, background: color, borderRadius: box ? 1 : 0, flexShrink: 0, opacity: box ? 0.6 : 1 }} />;
  const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.76rem", color: pressed || bold ? T.ink : VIZ.textSoft, fontWeight: pressed || bold ? 600 : 400, fontFamily: "inherit" };
  if (!onToggle) return <span style={base}>{key}{label}</span>;
  return (
    <button type="button" aria-pressed={pressed} onClick={onToggle} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)} style={{ ...base, background: "none", border: "none", padding: "0.15rem 0.2rem", cursor: "pointer", textDecoration: pressed ? "none" : "none" }} title={pressed ? "Show all peers again" : `Compare against ${label} only`}>
      {key}{label}
    </button>
  );
}
