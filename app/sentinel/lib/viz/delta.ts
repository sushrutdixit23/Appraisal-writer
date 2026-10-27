// Sentinel viz - a figure's change on the year before, ready for a tile. Pure.

import { formatPoints, formatSignedPercent, type MetricKind } from "./format";
import { deltaTone, pctChange, pointChange, type Desirability, type Tone } from "./semantics";

export type TileDelta = { text: string; change: number | null; tone: Tone; vs?: string };

/** Size, direction and meaning of `cur` against `prev`. Amounts change in %, margins in percentage points, ratios and days
 * in their own units. Returns null when either figure is missing, so a tile shows no chip rather than a made-up one. */
export function makeDelta(kind: MetricKind, want: Desirability, cur: number | null, prev: number | null, vs: string | undefined): TileDelta | null {
  if (cur == null || prev == null) return null;
  let change: number | null;
  let text: string;
  let eps = 0.0005;
  if (kind === "amount") {
    change = pctChange(cur, prev);
    text = change == null ? "" : formatSignedPercent(change);
  } else if (kind === "percent") {
    change = pointChange(cur, prev);
    text = change == null ? "" : formatPoints(change);
  } else if (kind === "multiple") {
    change = cur - prev;
    text = `${change >= 0 ? "+" : ""}${change.toFixed(2)}x`;
    eps = 0.005;
  } else {
    change = cur - prev;
    text = `${change >= 0 ? "+" : ""}${change.toFixed(0)}d`;
    eps = 0.5;
  }
  const tone = deltaTone(change, want, eps);
  return tone && change != null ? { text, change, tone, vs } : null;
}
