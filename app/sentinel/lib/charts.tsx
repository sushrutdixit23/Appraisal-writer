"use client";

// Sentinel — chart primitives. Hand-rolled SVG, not a charting library:
// this repo has no chart dependency installed, and these are simple
// enough (a horizontal bar chart, a line-with-points chart) not to
// justify adding one. Strictly Black + Sandstone per the brand spec.

import { T } from "./theme";

const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
const numFmt = (v: number) =>
  v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function HorizontalBarChart({
  data,
  isRatio,
  height = 26,
}: {
  data: { label: string; value: number }[];
  isRatio: boolean;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>No data for this metric.</p>
    );
  }
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const labelWidth = 150;
  const chartWidth = 640;
  const barAreaWidth = chartWidth - labelWidth;
  const rowH = height;
  const rowGap = 14;
  const totalH = sorted.length * (rowH + rowGap);

  const minVal = Math.min(0, ...sorted.map((d) => d.value));
  const maxVal = Math.max(0, ...sorted.map((d) => d.value));
  const span = maxVal - minVal || 1;
  const scaleX = (v: number) => ((v - minVal) / span) * barAreaWidth;
  const zeroX = scaleX(0);

  const fmt = isRatio ? pctFmt : numFmt;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${totalH}`}
      width="100%"
      style={{ maxWidth: chartWidth, fontFamily: "inherit" }}
    >
      {/* zero baseline */}
      <line
        x1={labelWidth + zeroX}
        x2={labelWidth + zeroX}
        y1={0}
        y2={totalH}
        stroke={T.rule}
        strokeWidth={1}
      />
      {sorted.map((d, i) => {
        const y = i * (rowH + rowGap);
        const x = scaleX(d.value);
        const barX = d.value >= 0 ? zeroX : x;
        const barW = Math.max(1, Math.abs(x - zeroX));
        const labelOnRight = d.value >= 0;
        return (
          <g key={d.label} transform={`translate(0, ${y})`}>
            <text
              x={labelWidth - 10}
              y={rowH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="12"
              fill={T.ink}
            >
              {d.label}
            </text>
            <rect
              x={labelWidth + barX}
              y={2}
              width={barW}
              height={rowH - 4}
              fill={T.chartPrimary}
            />
            <text
              x={
                labelWidth +
                (labelOnRight ? zeroX + barW + 8 : zeroX - barW - 8)
              }
              y={rowH / 2}
              textAnchor={labelOnRight ? "start" : "end"}
              dominantBaseline="middle"
              fontSize="11.5"
              fontWeight={600}
              fill={T.ink}
            >
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrendLineChart({
  data,
  isRatio,
  height = 220,
}: {
  data: { label: string; value: number }[];
  isRatio: boolean;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
        No quarterly data for this selection.
      </p>
    );
  }
  const width = 640;
  const padL = 56;
  const padB = 28;
  const padT = 12;
  const padR = 16;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const xStep = data.length > 1 ? plotW / (data.length - 1) : 0;
  const scaleY = (v: number) =>
    padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const scaleXi = (i: number) => padL + i * xStep;

  const points = data.map((d, i) => [scaleXi(i), scaleY(d.value)] as const);
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

  const fmt = isRatio ? pctFmt : numFmt;
  const gridTicks = 3;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
      {Array.from({ length: gridTicks + 1 }).map((_, i) => {
        const v = yMin + ((yMax - yMin) * i) / gridTicks;
        const y = scaleY(v);
        return (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke={T.rule} strokeWidth={1} />
            <text x={padL - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10.5" fill={T.inkSoft}>
              {fmt(v)}
            </text>
          </g>
        );
      })}
      <path d={linePath} fill="none" stroke={T.chartPrimary} strokeWidth={2} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill={T.chartAccent} />
      ))}
      {data.map((d, i) => (
        <text
          key={d.label}
          x={scaleXi(i)}
          y={height - 6}
          textAnchor="middle"
          fontSize="10.5"
          fill={T.inkSoft}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}
