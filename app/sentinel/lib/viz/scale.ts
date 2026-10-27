// Sentinel viz - scales and ticks. Pure.

/** A "nice" number near `range`: 1, 2, 5 or 10 times a power of ten. `round` picks the nearest, else the next one up. */
export function niceNumber(range: number, round: boolean): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

export type Ticks = { ticks: number[]; min: number; max: number; step: number; decimals: number };

/** Round-number ticks that cover [min, max]. `includeZero` forces the baseline in (bars always want it). */
export function niceTicks(min: number, max: number, target = 5, includeZero = false): Ticks {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1; // a flat series still gets a readable axis
    lo -= pad;
    hi += pad;
  }
  const step = niceNumber(niceNumber(hi - lo, false) / Math.max(1, target - 1), true);
  const niceMin = Math.floor(lo / step + 1e-9) * step;
  const niceMax = Math.ceil(hi / step - 1e-9) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks: number[] = [];
  const n = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= n; i++) ticks.push(Number((niceMin + i * step).toFixed(decimals + 2)));
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1], step, decimals };
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Index of the position nearest to x. */
export function nearestIndex(positions: number[], x: number): number {
  let best = 0;
  let bestD = Infinity;
  positions.forEach((p, i) => {
    const d = Math.abs(p - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Show every nth label so neighbours keep `minGap` pixels between them. The last label is always kept in step. */
export function labelStep(count: number, available: number, minGap: number): number {
  if (count <= 1) return 1;
  const pitch = available / (count - 1);
  return Math.max(1, Math.ceil(minGap / Math.max(pitch, 1)));
}

/** The y-domain of a line chart: round-number ticks with a little headroom, zero included when the data touches it. */
export function lineDomain(values: number[], target = 5): Ticks {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Data that crosses zero, or sits close to it, is read against zero; otherwise the axis follows the data.
  const nearZero = lo >= 0 && lo <= (hi - lo) * 0.6;
  return niceTicks(lo, hi, target, lo < 0 || nearZero);
}
