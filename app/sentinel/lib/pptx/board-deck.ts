// Sentinel - Board Deck PPTX builder (Export Engine Phase 2). Same
// "pure builder, no business logic" pattern as mis-pack.tsx: every
// number arrives already computed and formatted by the API route, so
// this file only lays things out on slides. Deliberately shorter and
// more condensed than the MIS Pack PDF - a board deck gets skimmed in
// a meeting, not read line by line, so Key Findings shows headlines
// only (see firstSentence() in the route), not full narratives.
//
// Table row cells are left untyped against pptxgenjs's own TableRow
// type (cast with "as any" at the addTable call) rather than importing
// and asserting an exact type name from the pptxgenjs type defs - the
// exact exported type names vary across versions, and guessing wrong
// here would be the same class of build break as the Buffer/BodyInit
// mismatch hit in Phase 1. The cell object shape itself is unchanged
// and still renders correctly; only the compile-time type check is
// relaxed for this one call.

import pptxgen from "pptxgenjs";

export type BoardDeckKpi = { label: string; value: string; note: string | null };

export type BoardDeckHealthCategory = { label: string; status: string };
export type BoardDeckHealth = { overall: string; categories: BoardDeckHealthCategory[] };

export type BoardDeckFinding = {
  periodLabel: string;
  status: string;
  headline: string;
  confidenceScore: number | null;
};

export type BoardDeckData = {
  companyName: string;
  sectorLabel: string;
  periodLabel: string;
  basis: string;
  generatedAt: string;
  kpis: BoardDeckKpi[];
  health: BoardDeckHealth | null;
  findings: BoardDeckFinding[];
};

// Locked Sentinel palette (Black + Sandstone). pptxgenjs takes hex
// colors WITHOUT the leading "#".
const INK = "161616";
const INK_SOFT = "5C5850";
const RULE = "DCD5C7";
const CARD = "FFFFFF";
const BACKGROUND = "F7F3EB";
const ACCENT = "A47551";

const HEALTH_COLOR: Record<string, string> = {
  healthy: "2F5233",
  watch: "8A6416",
  concern: "9A4A1F",
  critical: "8C2A2A",
  no_data: INK_SOFT,
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  concern: "Concern",
  critical: "Critical",
  no_data: "No data",
};

function addTitleSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText(data.companyName, {
    x: 0.6,
    y: 2.0,
    w: 8.8,
    h: 1.0,
    fontSize: 32,
    bold: true,
    color: INK,
  });
  slide.addText("Financial Intelligence Workspace - Board Deck", {
    x: 0.6,
    y: 2.9,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: INK_SOFT,
  });
  slide.addText(
    data.periodLabel +
      " (" +
      data.basis +
      ")  -  " +
      data.sectorLabel +
      "  -  Generated " +
      data.generatedAt,
    { x: 0.6, y: 4.8, w: 8.8, h: 0.4, fontSize: 11, color: INK_SOFT }
  );
}

function addKpiSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("KPI Summary", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  const rows = [
    [
      { text: "Metric", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "Value", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "vs Peers", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
    ],
    ...data.kpis.map((k) => [
      { text: k.label, options: { fontSize: 10, color: INK } },
      { text: k.value, options: { fontSize: 10, bold: true, color: INK } },
      { text: k.note ?? "-", options: { fontSize: 9, color: INK_SOFT } },
    ]),
  ];
  slide.addTable(rows as any, {
    x: 0.4,
    y: 0.9,
    w: 9.2,
    border: { type: "solid", color: RULE, pt: 0.5 },
    fill: { color: CARD },
    autoPage: false,
  });
}

function addHealthSlide(pres: pptxgen, data: BoardDeckData): void {
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("Business Health", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  if (!data.health) {
    slide.addText("No annual statement on file yet for this company.", {
      x: 0.4,
      y: 1.0,
      w: 9.2,
      h: 0.5,
      fontSize: 12,
      color: INK_SOFT,
    });
    return;
  }
  slide.addText(
    "Overall: " + (HEALTH_LABEL[data.health.overall] ?? data.health.overall),
    {
      x: 0.4,
      y: 0.9,
      w: 9.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: HEALTH_COLOR[data.health.overall] ?? INK_SOFT,
    }
  );
  const rows = [
    [
      { text: "Category", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
      { text: "Status", options: { bold: true, color: INK_SOFT, fontSize: 10 } },
    ],
    ...data.health.categories.map((c) => [
      { text: c.label, options: { fontSize: 10, color: INK } },
      {
        text: HEALTH_LABEL[c.status] ?? c.status,
        options: { fontSize: 10, bold: true, color: HEALTH_COLOR[c.status] ?? INK_SOFT },
      },
    ]),
  ];
  slide.addTable(rows as any, {
    x: 0.4,
    y: 1.5,
    w: 9.2,
    border: { type: "solid", color: RULE, pt: 0.5 },
    fill: { color: CARD },
    autoPage: false,
  });
}

function addFindingsSlide(pres: pptxgen, data: BoardDeckData): void {
  if (data.findings.length === 0) return;
  const slide = pres.addSlide();
  slide.background = { color: BACKGROUND };
  slide.addText("Key Findings", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: INK,
  });
  let y = 1.0;
  for (const f of data.findings) {
    slide.addText(f.periodLabel + "  -  " + (HEALTH_LABEL[f.status] ?? f.status), {
      x: 0.4,
      y,
      w: 9.2,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: ACCENT,
    });
    y += 0.32;
    slide.addText(f.headline, { x: 0.4, y, w: 9.2, h: 0.5, fontSize: 11, color: INK });
    y += 0.55;
    slide.addText(
      f.confidenceScore != null ? "Confidence: " + f.confidenceScore + "%" : "Confidence: -",
      { x: 0.4, y, w: 9.2, h: 0.3, fontSize: 9, color: INK_SOFT }
    );
    y += 0.5;
  }
}

export async function buildBoardDeck(data: BoardDeckData): Promise<Buffer> {
  const pres = new pptxgen();
  addTitleSlide(pres, data);
  addKpiSlide(pres, data);
  addHealthSlide(pres, data);
  addFindingsSlide(pres, data);
  const buf = await pres.write({ outputType: "nodebuffer" });
  return buf as Buffer;
}
