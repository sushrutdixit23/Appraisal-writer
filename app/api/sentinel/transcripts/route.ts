// Sentinel - earnings-call commentary (see lib/transcript.ts). POST reads an uploaded transcript (PDF, text file or pasted text) for one quarter, asks the
// model for the statements and their exact quotes, KEEPS ONLY what code can verify against the transcript, and stores the statements - never the transcript.
// GET lists a company's stored commentary; DELETE removes one. Private to the person who ran it.

import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isUuid } from "../../../sentinel/lib/access";
import { normaliseUsage, summariseUsage, type TurnUsage } from "../../../sentinel/lib/aiUsage";
import { isRealDate } from "../../../sentinel/lib/requestDates";
import { EXTRACTION_SYSTEM, extractionUser, MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS, parseModelItems, verifyItems } from "../../../sentinel/lib/transcript";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-sonnet-5";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Commentary is not set up on this database yet. Run supabase/migrations/20261109000000_sentinel_transcripts.sql in the Supabase SQL editor.";
const publicRow = (r: Record<string, unknown>) => ({ id: r.id, period_end_date: r.period_end_date, source_label: r.source_label, items: r.items, dropped_count: r.dropped_count, dropped_reasons: r.dropped_reasons, updated_at: r.updated_at });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const loaded = await loadWorkspaceFor(a.admin, who.userId, new URL(req.url).searchParams.get("workspace_id"), "read");
  if (isFailure(loaded)) return loaded.error;
  const { data, error } = await a.admin.from("sentinel_transcripts").select("id,period_end_date,source_label,items,dropped_count,dropped_reasons,updated_at").eq("workspace_id", loaded.workspace.id).eq("owner_id", who.userId).order("period_end_date", { ascending: false }).limit(12);
  if (error) return notSetUp(error) ? NextResponse.json({ transcripts: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ transcripts: (data ?? []).map(publicRow), set_up: true });
}

async function textOf(file: File): Promise<{ text: string } | { error: string; status: number }> {
  if (file.size === 0) return { error: "The file is empty.", status: 400 };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is larger than 20MB.", status: 413 };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return { text: parsed.pages.map((p) => p.text).join("\n") };
    } catch {
      return { error: "Could not read this PDF. It may be corrupted or a scan (scans are not read here).", status: 400 };
    } finally {
      await parser.destroy();
    }
  }
  if (buffer.includes(0)) return { error: "Upload a PDF or a text file.", status: 400 };
  return { text: new TextDecoder("utf-8").decode(buffer) };
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "transcripts", 6, 10 * 60_000);
  if (limited) return limited.error;
  if (!process.env.ANTHROPIC_API_KEY) return fail("The AI service is not configured on this server.", 503);

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Send the transcript as a file or as text.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, form.get("workspace_id"), "read");
  if (isFailure(loaded)) return loaded.error;
  const periodEnd = form.get("period_end_date");
  if (!isRealDate(periodEnd)) return fail("Say which quarter this call was about (the date it ended, YYYY-MM-DD).", 400);
  const periodLabel = String(form.get("period_label") ?? "").slice(0, 20) || periodEnd;
  const label = String(form.get("source_label") ?? "").trim().slice(0, 60) || null;

  let text = String(form.get("text") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const got = await textOf(file);
    if ("error" in got) return fail(got.error, got.status);
    text = got.text;
  }
  text = text.replace(/\r\n?/g, "\n").trim();
  if (text.length < MIN_TRANSCRIPT_CHARS) return fail("That is too short to be a call transcript. Upload the whole transcript, or paste its text.", 422);
  if (text.length > MAX_TRANSCRIPT_CHARS) return fail(`That transcript is longer than ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-IN")} characters. Upload the management remarks and the question-and-answer part separately.`, 413);

  const meter: TurnUsage[] = [];
  let reply: string;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({ model: MODEL, max_tokens: 4000, thinking: { type: "disabled" }, system: EXTRACTION_SYSTEM, messages: [{ role: "user", content: extractionUser(loaded.workspace.company_name, periodLabel, text) }] });
    meter.push({ turn: "transcript", model: MODEL, ...normaliseUsage(res.usage) });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return fail("The AI service returned no text. Please try again.", 502);
    reply = block.text;
  } catch (e) {
    console.error("Sentinel transcript model error:", e);
    return fail("The AI service could not read the transcript just now. Please try again.", 502);
  }
  const raw = parseModelItems(reply);
  if (!raw) return fail("The AI service's reply could not be read. Please try again.", 502);

  const { items, dropped } = verifyItems(raw, text);
  const usage = summariseUsage(meter);
  const row = {
    workspace_id: loaded.workspace.id, owner_id: who.userId, period_end_date: periodEnd, source_label: label, text_chars: text.length, items,
    dropped_count: dropped.length, dropped_reasons: [...new Set(dropped.map((d) => d.reason))].slice(0, 5), generation_usage: usage, updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await a.admin.from("sentinel_transcripts").upsert(row, { onConflict: "workspace_id,owner_id,period_end_date" }).select("id").single();
  if (error) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error.message, 500);
  return NextResponse.json({ id: saved?.id, items, dropped_count: dropped.length, dropped_reasons: row.dropped_reasons, usage }, { status: 201 });
}

export async function DELETE(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Say which commentary to remove.", 400);
  const { data } = await a.admin.from("sentinel_transcripts").select("id").eq("id", id).eq("owner_id", who.userId).maybeSingle();
  if (!data) return fail("Not found.", 404);
  const { error } = await a.admin.from("sentinel_transcripts").delete().eq("id", id).eq("owner_id", who.userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
