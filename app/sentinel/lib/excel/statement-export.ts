// Sentinel - Excel statement export builder (Export Engine Phase 3).
// Two sheets, mirroring the two view-modes Financial Statements already
// has (raw + YoY%, and common-size toggle) rather than inventing a new
// layout:
//
//   "Income Statement" - the 11 line items exactly as reported (plain
//   values, never a formula - Sentinel does not compute these, the
//   filing does), plus YoY% (latest period vs prior, same scoping the
//   app's own YoY column uses) and EBITDA/PAT Margin as LIVE formulas
//   referencing the raw cells - these two rows genuinely are Sentinel-
//   computed, so a formula is honest here where it would not be for the
//   raw line items above them.
//
//   "Common-Size" - every raw line item as a live formula (cell /
//   that period's revenue cell), same math the page's own common-size
//   toggle does.
//
// Peer benchmark gaps are written as plain text (with a note), never a
// formula - peer data is not something the recipient's own model would
// want live-linked back to Sentinel's peer set.
//
// Every formula string here was generated and verified against real
// exceljs output opened in LibreOffice Calc before being written into
// this file - the values recompute correctly, including the blank-
// numerator edge case (a period with no exceptional items reported).

import ExcelJS from "exceljs";

export type StatementExportPeriod = {
  label: string;
  basis: string;
  values: Record<string, number | null>;
};

export type StatementExportPeerNote = {
  rowKey: string;
  note: string;
};

export type StatementExportData = {
  companyName: string;
  currencyUnit: string;
  periods: StatementExportPeriod[];
  peerNotes: StatementExportPeerNote[];
};

const INK_SOFT = "FF5C5850";
const BACKGROUND = "FFF7F3EB";

const ROWS: { label: string; key: string; bold?: boolean }[] = [
  { label: "Revenue from Operations", key: "revenue_from_operations", bold: true },
  { label: "Other Income", key: "other_income" },
  { label: "Total Income", key: "total_income", bold: true },
  { label: "Total Expenses", key: "total_expenses" },
  { label: "EBITDA", key: "ebitda", bold: true },
  { label: "Depreciation & Amortisation", key: "depreciation_amortisation" },
  { label: "Finance Costs", key: "finance_costs" },
  { label: "Exceptional Items", key: "exceptional_items" },
  { label: "Profit Before Tax", key: "profit_before_tax", bold: true },
  { label: "Tax Expense", key: "tax_expense" },
  { label: "Profit After Tax", key: "profit_after_tax", bold: true },
];

function colLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

export async function buildStatementWorkbook(data: StatementExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sentinel";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Income Statement");

  const firstPeriodCol = 2;
  const lastPeriodCol = firstPeriodCol + data.periods.length - 1;
  const yoyCol = lastPeriodCol + 1;
  const peerCol = yoyCol + 1;

  const header = sheet.getRow(1);
  header.getCell(1).value = "Line Item";
  data.periods.forEach((p, i) => {
    header.getCell(firstPeriodCol + i).value = p.label + " (" + p.basis + ")";
  });
  if (data.periods.length >= 2) {
    header.getCell(yoyCol).value = "YoY % (latest)";
  }
  header.getCell(peerCol).value = "vs Peers (latest FY)";
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: INK_SOFT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BACKGROUND } };
  });

  const rowNumberByKey: Record<string, number> = {};

  let r = 2;
  for (const row of ROWS) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = row.label;
    if (row.bold) excelRow.getCell(1).font = { bold: true };
    rowNumberByKey[row.key] = r;

    data.periods.forEach((p, i) => {
      const cell = excelRow.getCell(firstPeriodCol + i);
      const v = p.values[row.key];
      cell.value = v == null ? null : v;
      cell.numFmt = "#,##0.0";
      if (row.bold) cell.font = { bold: true };
    });

    if (data.periods.length >= 2) {
      const latestColLetter = colLetter(lastPeriodCol);
      const priorColLetter = colLetter(lastPeriodCol - 1);
      const cell = excelRow.getCell(yoyCol);
      cell.value = {
        formula:
          "IF(OR(" +
          priorColLetter +
          r +
          "=0,ISBLANK(" +
          priorColLetter +
          r +
          ')),"",(' +
          latestColLetter +
          r +
          "-" +
          priorColLetter +
          r +
          ")/ABS(" +
          priorColLetter +
          r +
          "))",
      };
      cell.numFmt = "+0.0%;-0.0%";
    }

    const peerNote = data.peerNotes.find((n) => n.rowKey === row.key);
    if (peerNote) {
      excelRow.getCell(peerCol).value = peerNote.note;
      excelRow.getCell(peerCol).font = { italic: true, color: { argb: INK_SOFT } };
    }

    r += 1;
  }

  const marginRows: { label: string; numeratorKey: string; peerKey: string | null }[] = [
    { label: "EBITDA Margin", numeratorKey: "ebitda", peerKey: "ebitda_margin" },
    { label: "PAT Margin", numeratorKey: "profit_after_tax", peerKey: "pat_margin" },
  ];
  for (const mr of marginRows) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = mr.label;
    excelRow.getCell(1).font = { italic: true, color: { argb: INK_SOFT } };
    data.periods.forEach((p, i) => {
      const col = firstPeriodCol + i;
      const colL = colLetter(col);
      const numRow = rowNumberByKey[mr.numeratorKey];
      const revRow = rowNumberByKey["revenue_from_operations"];
      const cell = excelRow.getCell(col);
      cell.value = {
        formula:
          "IF(OR(" +
          colL +
          revRow +
          "=0,ISBLANK(" +
          colL +
          revRow +
          ')),"",' +
          colL +
          numRow +
          "/" +
          colL +
          revRow +
          ")",
      };
      cell.numFmt = "0.0%";
      cell.font = { italic: true, color: { argb: INK_SOFT } };
    });
    const peerNote = mr.peerKey ? data.peerNotes.find((n) => n.rowKey === mr.peerKey) : undefined;
    if (peerNote) {
      excelRow.getCell(peerCol).value = peerNote.note;
      excelRow.getCell(peerCol).font = { italic: true, color: { argb: INK_SOFT } };
    }
    r += 1;
  }

  sheet.getColumn(1).width = 32;
  for (let i = firstPeriodCol; i <= peerCol; i++) {
    sheet.getColumn(i).width = 18;
  }

  const csSheet = workbook.addWorksheet("Common-Size");
  const csHeader = csSheet.getRow(1);
  csHeader.getCell(1).value = "Line Item";
  data.periods.forEach((p, i) => {
    csHeader.getCell(firstPeriodCol + i).value = p.label;
  });
  csHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: INK_SOFT } };
  });

  let csRowNum = 2;
  for (const row of ROWS) {
    const excelRow = csSheet.getRow(csRowNum);
    excelRow.getCell(1).value = row.label;
    if (row.bold) excelRow.getCell(1).font = { bold: true };
    data.periods.forEach((p, i) => {
      const col = firstPeriodCol + i;
      const colL = colLetter(col);
      const thisRowInStatementSheet = rowNumberByKey[row.key];
      const revRowInStatementSheet = rowNumberByKey["revenue_from_operations"];
      const cell = excelRow.getCell(col);
      cell.value = {
        formula:
          "IF(OR('Income Statement'!" +
          colL +
          revRowInStatementSheet +
          "=0,ISBLANK('Income Statement'!" +
          colL +
          revRowInStatementSheet +
          ')),"",\'Income Statement\'!' +
          colL +
          thisRowInStatementSheet +
          "/'Income Statement'!" +
          colL +
          revRowInStatementSheet +
          ")",
      };
      cell.numFmt = "0.0%";
      if (row.bold) cell.font = { bold: true };
    });
    csRowNum += 1;
  }
  csSheet.getColumn(1).width = 32;
  for (let i = firstPeriodCol; i <= lastPeriodCol; i++) {
    csSheet.getColumn(i).width = 14;
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
