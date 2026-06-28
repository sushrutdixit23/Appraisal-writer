import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { topic, notes } = await req.json();
  if (!topic?.trim()) return NextResponse.json({ error: "Topic is required." }, { status: 400 });

  // Get client + voice profile
  const { data: client } = await supabase
    .from("clients")
    .select("id, unipile_account_id, voice_name, voice_role, voice_tone, voice_signoff, voice_rules")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Also fetch profile samples
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_tone, voice_rules, voice_signoff, sample1, sample2, sample3")
    .eq("auth_user_id", user.id)
    .single();

  // Merge profile voice data into client (profile takes precedence if set)
  if (profile) {
    if (profile.voice_tone) client.voice_tone = profile.voice_tone;
    if (profile.voice_rules) client.voice_rules = profile.voice_rules;
    if (profile.voice_signoff) client.voice_signoff = profile.voice_signoff;
  }

  const samplePosts = [profile?.sample1, profile?.sample2, profile?.sample3]
    .filter(Boolean)
    .map((s, i) => `--- Sample ${i + 1} ---\n${s}`)
    .join("\n\n");
  if (!client.unipile_account_id) return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });

  const systemPrompt = `You are a LinkedIn ghostwriter for ${client.voice_name}, a ${client.voice_role}.

Your job is to write a LinkedIn post that sounds EXACTLY like them — not like a ghostwriter, not like a marketer, not like an AI.

VOICE PROFILE:
- Tone: ${client.voice_tone || "direct, concise, founder voice"}
- Rules: ${client.voice_rules || "no buzzwords, no corporate language, write like a person"}
- Style: Direct, human, no corporate language

${samplePosts ? `WRITING SAMPLES — study these carefully. Match the rhythm, sentence length, paragraph structure, and vocabulary exactly:

${samplePosts}` : ""}

POST WRITING RULES:
1. Match the exact sentence rhythm and paragraph length from the writing samples above.
2. One idea per paragraph. Single sentences are fine and often better.
3. Hook on line one — a statement, observation, or tension. Never start with "I am excited", "Today I want to", or "I am happy to share".
4. Never start with "I" as the first word.
5. ZERO markdown — no **bold**, no *italics*, no bullet points, no dashes as bullets, no headers.
6. No hashtags. No emojis.
7. Never use em dashes (—) anywhere in the post body. They are an AI tell. Use a period or a new sentence instead.
7. No generic closing questions. End with a specific thought, a position, or a quiet call to action.
8. 100-220 words maximum. Shorter is almost always better.
9. Have an opinion. Take a position. Say something the reader won't have read today.
10. Sound like someone who has actually done the thing, not read about it.
11. Plain paragraphs only. No formatting of any kind.

Return ONLY the post text. Nothing else.`;

const userMessage = `Topic: ${topic.trim()}${notes?.trim() ? `\n\nAdditional notes: ${notes.trim()}` : ""}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const draft = (response.content[0] as { text: string }).text.trim();

  // Save to interactions as a post_draft
  const { data: interaction, error: saveError } = await supabase
    .from("interactions")
    .insert({
      id: randomUUID(),
      client_id: client.id,
      type: "post_draft",
      name: client.voice_name,
      role: client.voice_role,
      text: topic.trim(),
      reply: draft,
      status: "pending",
      classification: "post",
      intent: topic.trim(),
      requires_human: true,
      confidence: 100,
      source_account_id: client.unipile_account_id,
    })
    .select()
    .single();

  if (saveError) return NextResponse.json({ error: "Failed to save draft.", detail: saveError.message, code: saveError.code }, { status: 500 });

  return NextResponse.json({ id: interaction.id, draft });
}
