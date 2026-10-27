// Sentinel viz - mark geometry. Pure.

/** A column rooted on the baseline: square at the baseline, `r` px rounded at the data end. `dir` 1 rises, -1 hangs.
 * Every call returns a path with the SAME commands, so an animation from height 0 to full height interpolates. */
export function columnPath(x: number, baseY: number, w: number, h: number, r: number, dir: 1 | -1 = 1): string {
  const hh = Math.max(0, h);
  const rr = Math.max(0, Math.min(r, hh, w / 2));
  const tip = baseY - dir * hh; // the data end
  const inner = tip + dir * rr;
  const f = (v: number) => v.toFixed(2);
  return [
    `M${f(x)} ${f(baseY)}`,
    `L${f(x)} ${f(inner)}`,
    `Q${f(x)} ${f(tip)} ${f(x + rr)} ${f(tip)}`,
    `L${f(x + w - rr)} ${f(tip)}`,
    `Q${f(x + w)} ${f(tip)} ${f(x + w)} ${f(inner)}`,
    `L${f(x + w)} ${f(baseY)}`,
    "Z",
  ].join(" ");
}
