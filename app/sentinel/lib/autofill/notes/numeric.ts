// Sentinel autofill / notes - reading numbers out of a PDF table row. Annual-report tables print figures as "1,234", "(48)", "[2,367]" (the prior year,
// in brackets), "-" or an en dash for nil, a currency glyph the PDF font turned into "I", "H", "`" or "₹", and sometimes two cells inside one tab stop.
// Everything here is deliberately strict: a token that is not clearly a figure makes the whole row "not a figure row", so prose is never read as numbers.

export type Cell = { value: number; bracketed: boolean };

const NIL = new Set(["-", "–", "—", "−", "^", "nil", "Nil", "NIL"]);
const CURRENCY = new Set(["I", "H", "K", "`", "₹", "Rs", "Rs.", "INR", "$", "US$", "€"]);

/** One whitespace-free token as a figure: "1,234" "(48)" "[2,367]" "-" "12.5" "(1.2)%". Null when it is anything else. */
export function parseToken(raw: string): Cell | null {
  let t = raw.trim();
  if (t === "") return null;
  let bracketed = false;
  if (t.startsWith("[") && t.endsWith("]")) { bracketed = true; t = t.slice(1, -1).trim(); }
  if (NIL.has(t)) return { value: 0, bracketed };
  t = t.replace(/%$/, "");
  let negative = false;
  if (t.startsWith("(") && t.endsWith(")")) { negative = true; t = t.slice(1, -1); }
  if (t.startsWith("-") || t.startsWith("−")) { negative = true; t = t.slice(1); }
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { value: negative ? -n : n, bracketed };
}

export type Row = { label: string; cells: Cell[]; bracketed: boolean; text: string };

/** Splits a table line into a text label and its figures, or returns null when the line holds no figure. The label is everything before the first figure;
 * every token after it must be a figure or a currency glyph, otherwise the line is prose that happens to contain a number. */
export function parseRow(line: string): Row | null {
  const parts = line.split("\t").flatMap((c) => c.trim().split(/\s+/)).filter((t) => t !== "");
  const label: string[] = [];
  let i = 0;
  // The label: leading tokens that are not figures. A bare "-" is a figure (nil), so a label can never contain one, but a label may contain an en dash joining words.
  while (i < parts.length) {
    const t = parts[i];
    if (CURRENCY.has(t)) { i++; continue; }
    if (parseToken(t) && !/^[A-Za-z]/.test(t)) {
      // "–" between words ("receivables – considered good") is punctuation, not nil: it is nil only when every remaining token is a figure.
      const rest = parts.slice(i).filter((x) => !CURRENCY.has(x));
      if (rest.every((x) => parseToken(x) != null)) break;
      label.push(t); i++; continue;
    }
    label.push(t); i++;
  }
  const rest = parts.slice(i).filter((x) => !CURRENCY.has(x));
  if (rest.length === 0) return null;
  const cells = rest.map(parseToken);
  if (cells.some((c) => c == null)) return null;
  const figs = cells as Cell[];
  return { label: label.join(" ").replace(/\s+/g, " ").trim(), cells: figs, bracketed: figs.every((c) => c.bracketed), text: line.replace(/\t/g, "  ").replace(/\s+/g, " ").trim() };
}
