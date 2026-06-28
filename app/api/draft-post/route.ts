import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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
1. Write in first person, in ${client.voice_name}'s voice.
2. Hook on the first line — no fluff, no "I am excited to share".
3. Short paragraphs. One idea per paragraph. White space matters on LinkedIn.
4. No hashtags unless specifically requested.
5. No emojis unless the voice profile suggests them.
6. End with a clear thought, question, or call to action — not a generic "let me know your thoughts".
7. Keep it between 150-300 words unless the topic demands more.
8. Never start with "I" as the first word.
9. Sound like a person, not a press release.

Return ONLY the post text. No commentary, no preamble, no quotes around it.`;

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
      client_id: client.id,
      auth_user_id: user.id,
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

  if (saveError) return NextResponse.json({ error: "Failed to save draft." }, { status: 500 });

  return NextResponse.json({ id: interaction.id, draft });
}
