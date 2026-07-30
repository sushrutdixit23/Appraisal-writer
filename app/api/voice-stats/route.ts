import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INSIGHTS_SYSTEM_PROMPT = `You are analyzing a professional's sent LinkedIn messages to describe their communication voice back to them, based on real edits they made to AI-drafted replies and posts. You receive two inputs: EDITED PAIRS (the AI's original draft next to what the person actually sent, after they changed it - this is the highest-signal data available, since it shows exactly what they choose to change) and UNEDITED SENDS (messages they approved as-drafted, for baseline tone).

Your job is to describe real, evidence-based patterns - not generic compliments and not invented traits. Every pattern must be grounded in something visible across multiple examples, not a single instance.

Return ONLY valid JSON - no markdown fences, no commentary - matching exactly this shape:

{
  "summary": "<2-3 sentences, written TO the person about their own communication style, grounded in what the edits actually show>",
  "tone_patterns": ["<a specific, observable pattern in how they edit - e.g. 'shortens greetings and gets to the point faster', 'adds a direct question at the end more often than the draft included one'>"],
  "themes": ["<a recurring topic, interest, or professional focus actually reflected across their sent messages - not generic words>"]
}

Rules:
- 2 to 4 entries in tone_patterns, 2 to 5 entries in themes. Fewer honest entries beats padded generic ones.
- If the edited pairs do not show a clear pattern for something, omit that category's entries rather than inventing one - an empty array is a valid, honest answer.
- Never quote a full message verbatim in the output - describe the pattern, do not reproduce the text.
- Write summary and patterns in second person ("you"), like a coach reflecting observations back, not a report about a third party.`;

type VoiceInsights = { summary: string; tone_patterns: string[]; themes: string[] };

async function generateVoiceInsights(edited: any[], unedited: any[]): Promise<VoiceInsights | null> {
  const editedBlock = edited
    .slice(0, 20)
    .map((i, idx) => `${idx + 1}. TYPE: ${i.type}\n   DRAFTED: ${(i.original_draft || "").slice(0, 500)}\n   SENT: ${(i.reply || "").slice(0, 500)}`)
    .join("\n\n");

  const uneditedBlock = unedited
    .slice(0, 10)
    .map((i, idx) => `${idx + 1}. TYPE: ${i.type}\n   SENT AS DRAFTED: ${(i.reply || "").slice(0, 500)}`)
    .join("\n\n");

  const userMessage = `EDITED PAIRS (${edited.length} total, showing up to 20 most recent):\n${editedBlock || "(none)"}\n\nUNEDITED SENDS (${unedited.length} total, showing up to 10 most recent):\n${uneditedBlock || "(none)"}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: INSIGHTS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = message.content.find((block: any) => block.type === "text") as any;
    const raw = textBlock?.text ?? "";
    if (!raw) {
      console.error("Voice insights: no text block in Claude response.");
      return null;
    }
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1];
    } else {
      const braceMatch = cleaned.match(/\{[\s\S]*\}/);
      if (braceMatch) cleaned = braceMatch[0];
    }
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.error("Voice insights: generation failed:", err?.message || err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, created_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { data: sent } = await supabase
    .from("interactions")
    .select("type, reply, original_draft, created_at")
    .eq("client_id", client.id)
    .eq("status", "sent")
    .order("created_at", { ascending: false });

  const items = sent || [];
  const totalSent = items.length;
  const repliesSent = items.filter(i => i.type !== "post_draft").length;
  const postsSent = items.filter(i => i.type === "post_draft").length;

  const comparable = items.filter(i => i.original_draft && i.reply);
  const edited = comparable.filter(i => {
    const a = (i.original_draft || "").trim();
    const b = (i.reply || "").trim();
    return a !== b;
  });
  const unedited = comparable.filter(i => {
    const a = (i.original_draft || "").trim();
    const b = (i.reply || "").trim();
    return a === b;
  });
  const editRate = comparable.length > 0 ? Math.round((edited.length / comparable.length) * 100) : null;

  let avgLengthChangePct: number | null = null;
  if (edited.length > 0) {
    const changes = edited.map(i => {
      const origLen = (i.original_draft || "").length || 1;
      const newLen = (i.reply || "").length;
      return ((newLen - origLen) / origLen) * 100;
    });
    avgLengthChangePct = Math.round(changes.reduce((s, v) => s + v, 0) / changes.length);
  }

  const daysActive = client.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(client.created_at).getTime()) / (1000*60*60*24)))
    : null;

  const hasEnoughData = totalSent >= 3;

  let insights: VoiceInsights | null = null;
  if (hasEnoughData) {
    const { data: cached } = await supabase
      .from("voice_insights")
      .select("summary, tone_patterns, themes, based_on_count")
      .eq("client_id", client.id)
      .maybeSingle();

    const needsRefresh = edited.length > 0 && (!cached || totalSent - cached.based_on_count >= 5);

    if (needsRefresh) {
      const generated = await generateVoiceInsights(edited, unedited);
      if (generated) {
        insights = generated;
        await supabase.from("voice_insights").upsert({
          client_id: client.id,
          summary: generated.summary,
          tone_patterns: generated.tone_patterns,
          themes: generated.themes,
          based_on_count: totalSent,
          generated_at: new Date().toISOString(),
        }, { onConflict: "client_id" });
      } else if (cached) {
        insights = { summary: cached.summary, tone_patterns: cached.tone_patterns, themes: cached.themes };
      }
    } else if (cached) {
      insights = { summary: cached.summary, tone_patterns: cached.tone_patterns, themes: cached.themes };
    }
  }

  return NextResponse.json({
    totalSent,
    repliesSent,
    postsSent,
    editRate,
    avgLengthChangePct,
    insights,
    daysActive,
    hasEnoughData,
  });
}
