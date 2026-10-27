// Sentinel viz - sorting and CSV for tables. Pure.

export type SortDir = "asc" | "desc";

/** Numbers by value, text by locale; a missing value sorts LAST whichever way the column is sorted. */
export function compareCells(a: number | string | null | undefined, b: number | string | null | undefined, dir: SortDir): number {
  const am = a == null || (typeof a === "number" && !Number.isFinite(a));
  const bm = b == null || (typeof b === "number" && !Number.isFinite(b));
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? r : -r;
}

/** Stable sort: equal rows keep the order they came in. */
export function sortRows<T>(rows: T[], accessor: (row: T) => number | string | null | undefined, dir: SortDir): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => compareCells(accessor(x.row), accessor(y.row), dir) || x.index - y.index)
    .map((x) => x.row);
}

/** Next state when a header is clicked: a new column starts in its natural direction, the same column flips. */
export function nextSort(current: { key: string; dir: SortDir } | null, key: string, natural: SortDir = "desc"): { key: string; dir: SortDir } {
  if (!current || current.key !== key) return { key, dir: natural };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

const needsQuotes = /[",\r\n]/;
/** A spreadsheet treats a text cell that starts with = + - @ as a formula; defuse it. Numbers are left alone. */
function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return needsQuotes.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
