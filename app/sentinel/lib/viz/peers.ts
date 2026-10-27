// Sentinel viz - peer arithmetic and the colour of a heat cell. Pure.

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export type PeerBand = { min: (number | null)[]; max: (number | null)[]; median: (number | null)[]; n: number[] };

/** Per x-position: the spread of the PEERS (everyone but the subject). A band needs at least two peers there. */
export function peerBand(series: { id: string; values: (number | null)[] }[], subjectId: string, length: number): PeerBand {
  const peers = series.filter((s) => s.id !== subjectId);
  const out: PeerBand = { min: [], max: [], median: [], n: [] };
  for (let i = 0; i < length; i++) {
    const vals = peers.map((p) => p.values[i]).filter((v): v is number => v != null && Number.isFinite(v));
    out.n.push(vals.length);
    if (vals.length >= 2) {
      out.min.push(Math.min(...vals));
      out.max.push(Math.max(...vals));
      out.median.push(median(vals));
    } else {
      out.min.push(null);
      out.max.push(null);
      out.median.push(null);
    }
  }
  return out;
}

/** 0..1 for each value, 1 = best in the column, direction-aware; null stays null; ties share a score. */
export function columnScores(values: (number | null)[], want: "higher" | "lower"): (number | null)[] {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (present.length < 2 || hi === lo) return 0.5;
    const t = (v - lo) / (hi - lo);
    return want === "higher" ? t : 1 - t;
  });
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

/** One-hue ramp, light to dark: the surface at 0, the subject bronze at its strongest. Capped so text stays readable. */
export function heatColor(t: number, surface = "#FFFFFF", hue = "#B0652B", cap = 0.5): string {
  return mixHex(surface, hue, Math.max(0, Math.min(1, t)) * cap);
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio of two colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Ink or white, whichever reads better on `bg`. */
export function readableText(bg: string, ink = "#161616"): string {
  return contrastRatio(bg, ink) >= contrastRatio(bg, "#FFFFFF") ? ink : "#FFFFFF";
}
