// Sentinel viz - what a change MEANS. Pure.
//
// A rising number is not always good news: revenue up is good, days outstanding up is not, and costs rising with
// the business is neither. Every delta chip is coloured by direction x desirability, and always carries an arrow and
// a sign as well, so colour is never the only channel.

export type Desirability = "higher" | "lower" | "neutral";
export type Tone = "favorable" | "unfavorable" | "flat" | "neutral";

/** Change measured against the SIZE of the prior figure, so a loss that narrows reads as growth, as the engine does. */
export function pctChange(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (current == null || prior == null || prior === 0 || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  return (current - prior) / Math.abs(prior);
}

/** Difference of two figures that are already ratios (margins): the change in percentage points, as a fraction. */
export function pointChange(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  return current - prior;
}

/** Compound annual growth. Only defined when both ends are positive and time has passed. */
export function cagr(first: number | null | undefined, last: number | null | undefined, years: number): number | null {
  if (first == null || last == null || !(first > 0) || !(last > 0) || !(years > 0)) return null;
  return (last / first) ** (1 / years) - 1;
}

/** Whole years between two ISO dates (financial-year ends are 365 or 366 days apart, so round). */
export function yearsBetween(isoA: string, isoB: string): number {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round(Math.abs(b - a) / (365.25 * 86400000));
}

export function deltaTone(change: number | null, want: Desirability, epsilon = 0.0005): Tone | null {
  if (change == null || !Number.isFinite(change)) return null;
  if (Math.abs(change) < epsilon) return "flat";
  if (want === "neutral") return "neutral";
  const up = change > 0;
  return (want === "higher") === up ? "favorable" : "unfavorable";
}


/** The arrow follows the DIRECTION of the change, not whether it is good. */
export function arrowFor(change: number | null, epsilon = 0.0005): "▲" | "▼" | "▬" | null {
  if (change == null || !Number.isFinite(change)) return null;
  if (Math.abs(change) < epsilon) return "▬";
  return change > 0 ? "▲" : "▼";
}

/** Plain-words version of a tone, for screen readers and the table view. */
export function toneWords(tone: Tone | null): string {
  switch (tone) {
    case "favorable": return "favourable";
    case "unfavorable": return "unfavourable";
    case "flat": return "unchanged";
    default: return "";
  }
}
