// Sentinel viz - number formatting for marks, ticks and tables. Pure.
//
//   amount    a rupee amount in whatever unit the page is showing (the caller converts; this only formats)
//   percent   a ratio held as a fraction (0.123 -> "12.3%")
//   multiple  a times-figure ("1.25x")
//   days      a count of days ("32d")

export type MetricKind = "amount" | "percent" | "multiple" | "days";

const group = (v: number, decimals: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** "1,30,000" with Indian grouping. Negative zero never prints as "-0". */
export function formatAmount(v: number, decimals = 0): string {
  const r = Number(v.toFixed(decimals));
  return group(Object.is(r, -0) ? 0 : r, decimals);
}

/** Accounting style for tables: negatives in brackets, "(1,200.0)". */
export function formatAccounting(v: number, decimals = 1): string {
  const r = Number(v.toFixed(decimals));
  return r < 0 ? `(${group(Math.abs(r), decimals)})` : group(Object.is(r, -0) ? 0 : r, decimals);
}

export const formatPercent = (v: number, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;
export const formatMultiple = (v: number, decimals = 2) => `${v.toFixed(decimals)}x`;
export const formatDays = (v: number) => `${v.toFixed(0)}d`;

/** "+30.0%" / "-4.2%" - the sign is always shown, so a change never reads as a level. */
export function formatSignedPercent(v: number, decimals = 1): string {
  const s = (v * 100).toFixed(decimals);
  return `${Number(s) > 0 ? "+" : ""}${s}%`;
}

/** Percentage points: "+0.3pp". `v` is a difference of two fractions. */
export function formatPoints(v: number, decimals = 1): string {
  const s = (v * 100).toFixed(decimals);
  return `${Number(s) > 0 ? "+" : ""}${s}pp`;
}

export function formatSignedAmount(v: number, decimals = 0): string {
  const s = formatAmount(v, decimals);
  return v > 0 && Number(s.replace(/,/g, "")) !== 0 ? `+${s}` : s;
}

/** A value of the given kind, as shown beside a mark or in a tooltip. */
export function formatValue(kind: MetricKind, v: number, amountDecimals = 0): string {
  switch (kind) {
    case "amount": return formatAmount(v, amountDecimals);
    case "percent": return formatPercent(v);
    case "multiple": return formatMultiple(v);
    case "days": return formatDays(v);
  }
}

/** An axis tick of the given kind. `decimals` comes from the tick step so ticks never repeat ("1.0, 1.0, 2.0"). */
export function formatTick(kind: MetricKind, v: number, decimals: number): string {
  switch (kind) {
    case "amount": return formatAmount(v, decimals);
    case "percent": return `${(v * 100).toFixed(Math.max(0, decimals - 2))}%`;
    case "multiple": return `${v.toFixed(Math.min(2, decimals))}x`;
    case "days": return `${v.toFixed(0)}d`;
  }
}

/** Is a label of `chars` characters at `fontPx` going to fit inside a mark `widthPx` wide, with `pad` each side? */
export function labelFits(chars: number, fontPx: number, widthPx: number, pad = 6): boolean {
  return chars * fontPx * 0.58 + pad * 2 <= widthPx;
}

/** Break a label into lines of at most `maxChars`, on word boundaries; a single long word is kept whole. */
export function wrapWords(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    return [...head, lines.slice(maxLines - 1).join(" ")];
  }
  return lines;
}
