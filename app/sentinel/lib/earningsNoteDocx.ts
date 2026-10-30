// Sentinel - renders the draft earnings note (earningsNote.ts) to a Word file. Plain styling on purpose: a note an analyst will edit and send, not a
// designed document. Runs on the server only (the route returns the bytes).

import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { EarningsNote, NoteBlock, NoteTable } from "./earningsNote";

const FONT = "Calibri";
const INK = "1F2937";
const SOFT = "6B7280";

const run = (text: string, over: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: FONT, size: over.size ?? 21, bold: over.bold, italics: over.italics, color: over.color ?? INK });

const cell = (text: string, opts: { head?: boolean; right?: boolean; width: number }) =>
  new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    shading: opts.head ? { fill: "EEF1F4", color: "auto", type: "clear" as never } : undefined,
    children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(text, { bold: opts.head, size: 19 })] })],
  });

function tableOf(t: NoteTable): Table {
  const total = 9360; // US Letter text width in twentieths of a point (6.5 in)
  const first = Math.round(total * 0.28);
  const rest = Math.floor((total - first) / Math.max(t.head.length - 1, 1));
  const widths = t.head.map((_, i) => (i === 0 ? first : rest));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: t.head.map((h, i) => cell(h, { head: true, right: t.numeric && i > 0, width: widths[i] })) }),
      ...t.rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { right: t.numeric && i > 0, width: widths[i] })) })),
    ],
  });
}

function blockOf(b: NoteBlock): (Paragraph | Table)[] {
  if (b.kind === "paragraph") return [new Paragraph({ spacing: { after: 120 }, children: [run(b.text, { italics: b.italic, color: b.italic ? SOFT : INK })] })];
  if (b.kind === "bullets") return b.items.map((text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 70 }, children: [run(text)] }));
  return [tableOf(b.table), new Paragraph({ spacing: { after: 120 }, children: [] })];
}

export async function renderEarningsNoteDocx(note: EarningsNote): Promise<Buffer> {
  const doc = new Document({
    creator: "Sentinel",
    title: note.title,
    description: "Draft earnings note generated from figures on file",
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 60 }, children: [run(note.title, { bold: true, size: 40 })] }),
        new Paragraph({ spacing: { after: 160 }, children: [run(note.subtitle, { color: SOFT })] }),
        new Paragraph({
          spacing: { after: 220 },
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: "B45309", space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "B45309", space: 4 } },
          children: [run(note.banner, { bold: true, size: 19, color: "92400E" })],
        }),
        ...note.sections.flatMap((s) => [
          new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 100 }, children: [run(s.heading, { bold: true, size: 26 })] }),
          ...s.blocks.flatMap(blockOf),
        ]),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
