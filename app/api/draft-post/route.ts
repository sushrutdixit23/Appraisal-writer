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
  if (!client.unipile_account_id) return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });

  const systemPrompt = `You are a LinkedIn ghostwriter for ${client.voice_name}, a ${client.voice_role}.

Your job is to draft a LinkedIn post in their exact voice.

Voice profile:
- Tone: ${client.voice_tone || "professional and direct"}
- Sign-off style: ${client.voice_signoff || "none"}
- Voice rules: ${client.voice_rules || "none"}

LinkedIn post rules:
1. Write in first person, in ${client.voice_name}'s voice — direct, specific, no corporate fog.
2. Hook on the first line. Make it a statement or observation that creates tension or curiosity. No "I am excited to share", no "Today I want to talk about".
3. Short paragraphs. One idea per paragraph. Single sentences are fine. White space is not optional.
4. NEVER use markdown formatting — no **bold**, no *italics*, no bullet points with dashes or asterisks. Plain text only.
5. No hashtags.
6. No emojis.
7. No generic closing questions like "What do you think?" or "Let me know your thoughts."
8. Never start with "I" as the first word.
9. Write from a point of view — have an opinion, take a position, say something specific.
10. Sound like a person who has actually done the thing, not someone who has read about it.
11. Keep it between 100-250 words. Shorter is almost always better.
12. No section headers, no bold text, no formatting of any kind. Just paragraphs.

Return ONLY the post text. Nothing else. No preamble, no commentary, no quotation marks around it.`;

  const userMessage = `Topic: ${topic.trim()}${notes?.trim() ? `\n\nAdditional notes: ${notes.trim()}` : ""}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
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
