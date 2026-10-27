// Sentinel autofill - Excel workbooks to a plain grid of text, for the sheet reader. Server only (exceljs).
//
// A workbook can hold several sheets (the statement, a notes sheet, a chart sheet). The one that looks most like
// a statement - the most recognisable line items or field headings - is the one read.

import ExcelJS from "exceljs";
import { matchFieldHeader, matchLabel } from "./labels";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_ROWS = 600;
const MAX_COLS = 60;

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // A cell formatted "Mar-26" holds 1 March 2026; as a column heading it means the month, so say that.
    if (/m{3,5}[^d]{0,4}y{2,4}/i.test(cell.numFmt ?? "") && !/d/i.test((cell.numFmt ?? "").replace(/\[[^\]]*\]/g, ""))) {
      return `${MONTH_SHORT[v.getUTCMonth()]}-${String(v.getUTCFullYear()).slice(-2)}`;
    }
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return "";
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText({ value: o.result as ExcelJS.CellValue, numFmt: cell.numFmt } as ExcelJS.Cell);
    if (typeof o.text === "string") return o.text;
  }
  return "";
}

function sheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  const lastRow = Math.min(ws.rowCount, MAX_ROWS);
  const lastCol = Math.min(ws.columnCount, MAX_COLS);
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= lastCol; c++) cells.push(cellText(row.getCell(c)));
    rows.push(cells);
  }
  return rows;
}

function looksLikeStatement(rows: string[][]): number {
  let score = 0;
  for (const r of rows) {
    const label = r.slice(0, 3).find((c) => /[a-z]/i.test(c));
    if (label && matchLabel(label, null)) score += 1;
  }
  for (const r of rows.slice(0, 12)) score += Math.max(0, r.filter((c) => c && matchFieldHeader(c)).length - 2);
  return score;
}

export async function xlsxToRows(data: Buffer | Uint8Array | ArrayBuffer): Promise<{ rows: string[][]; sheetName: string; sheets: string[] }> {
  const wb = new ExcelJS.Workbook();
  const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data as Uint8Array);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets = wb.worksheets.filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden");
  if (sheets.length === 0) return { rows: [], sheetName: "", sheets: [] };
  let best = { rows: [] as string[][], name: sheets[0].name, score: -1 };
  for (const ws of sheets) {
    const rows = sheetRows(ws);
    const score = looksLikeStatement(rows);
    if (score > best.score) best = { rows, name: ws.name, score };
  }
  return { rows: best.rows, sheetName: best.name, sheets: sheets.map((s) => s.name) };
}
