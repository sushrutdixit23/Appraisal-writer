// Sentinel — Document Intelligence: PDF -> structured FinancialStatement
// draft. Text-based PDFs only for now (pdf-parse extracts raw text;
// Claude only labels/maps that text to fields - it never invents a
// number that isn't present in the source). Scanned/image-only PDFs are
// rejected with a clear message rather than silently producing garbage;
// vision-based OCR fallback is a follow-up, not built here.
//
// This route NEVER writes to sentinel_statements. It returns a draft for
// the client to pre-fill into the New Project form, where a human reviews
// and edits before Save & finish performs the actual insert - same
// confirm-before-trust pattern as the narrative approval gate.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Matches STATEMENT_FIELDS in new-project/page.tsx exactly. Balance
// sheet / cash flow fields exist in FinancialStatement but aren't
// collected by the manual form yet either - extraction stays scoped to
// what the form actually has inputs for, so nothing extracted is silently
// dropped on the floor.
const FIELD_LIST = [
  "revenue_from_operations",
  "other_income",
  "total_income",
  "total_expenses",
  "ebitda",
  "depreciation_amortisation",
  "finance_costs",
  "exceptional_items",
  "profit_before_tax",
  "tax_expense",
  "profit_after_tax",
];

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported right now." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    text = parsed.text;
  } catch {
    await parser.destroy();
    return NextResponse.json({ error: "Could not read this PDF. It may be corrupted." }, { status: 400 });
  }
  await parser.destroy();

  if (text.trim().length < 200) {
    return NextResponse.json(
      {
        error:
          "This looks like a scanned or image-based PDF with little to no extractable text. " +
          "Document Intelligence currently supports text-based PDFs only \u2014 please enter the figures " +
          "manually for now, or try a text-based export of this filing.",
      },
      { status: 422 }
    );
  }

  // Cap length to keep cost/latency bounded - a filing's financial
  // statement section comfortably fits well within this after pdf-parse
  // strips layout/images.
  const clipped = text.length > 40000 ? text.slice(0, 40000) : text;

  const systemPrompt =
    "You extract financial statement figures from filing text into structured JSON. Rules:\n" +
    "1. Only report a number if you can point to where it appears in the text. Never estimate, infer, or calculate a figure that isn't stated.\n" +
    "2. If a field isn't present in the text, its value is null - do not guess.\n" +
    "3. Report figures in the same unit as the source document; do not convert units yourself - note the unit you observed in extraction_notes.\n" +
    "4. period_label should be short, like \"FY25\" or \"Q3 FY26\". period_end_date must be \"YYYY-MM-DD\" or null if unclear.\n" +
    "5. Respond with ONLY a JSON object - no preamble, no markdown fences.";

  const userPrompt =
    `Extract these fields from the filing text below: ${FIELD_LIST.join(", ")}.\n\n` +
    `Also return period_type ("FY"|"Q1"|"Q2"|"Q3"|"Q4"), period_label, period_end_date, ` +
    `basis ("standalone"|"consolidated"), extraction_notes (units/ambiguities/anything not found), ` +
    `and low_confidence_fields (array of field names you're unsure about).\n\n` +
    `JSON shape:\n{"period_type": ..., "period_label": ..., "period_end_date": ..., "basis": ..., ` +
    `"fields": {"<field_name>": number|null, ...}, "extraction_notes": "...", "low_confidence_fields": ["..."]}\n\n` +
    `--- FILING TEXT ---\n${clipped}`;

  let draft: any;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    draft = JSON.parse(cleaned);
  } catch (err) {
    console.error("Sentinel extract parse error:", err);
    return NextResponse.json(
      { error: "Could not extract structured data from this filing. Please enter the figures manually." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    period_type: draft.period_type ?? null,
    period_label: draft.period_label ?? null,
    period_end_date: draft.period_end_date ?? null,
    basis: draft.basis ?? null,
    fields: draft.fields ?? {},
    extraction_notes: draft.extraction_notes ?? null,
    low_confidence_fields: draft.low_confidence_fields ?? [],
    source_file: file.name,
  });
}
