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

  const { original_text, original_reply, mode } = await req.json();

  const { data: client } = await supabase
    .from("clients")
    .select("id, unipile_account_id, voice_name, voice_role, voice_tone, voice_rules, voice_signoff")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("sample1, sample2, sample3, voice_rules, voice_tone, post_tone, post_rules, post_sample1, post_sample2, post_sample3")
    .eq("auth_user_id", user.id)
    .single();

  const effectivePostTone = profile?.post_tone || client.voice_tone;
  const effectivePostRules = profile?.post_rules || client.voice_rules;

  const postSpecificSamples = [profile?.post_sample1, profile?.post_sample2, profile?.post_sample3].filter(Boolean);
  const replySamples = [profile?.sample1, profile?.sample2, profile?.sample3].filter(Boolean);
  const samplesToUse = postSpecificSamples.length > 0 ? postSpecificSamples : replySamples;

  const samplePosts = samplesToUse
    .map((s, i) => "--- Sample " + (i+1) + " ---\n" + s)
    .join("\n\n");

  let prompt = "";

  if (mode === "repurpose") {
    prompt = `You previously wrote this LinkedIn post:

ORIGINAL TOPIC: ${original_text}

ORIGINAL POST:
${original_reply}

Now write a completely fresh version of this post with:
- A different opening hook
- A different angle or framing on the same core insight
- Different structure or format
- Same authentic voice

Do NOT copy sentences from the original. This should feel like a new post that explores the same idea differently.

${samplePosts ? "Match this writing style:\n" + samplePosts : ""}`;
  } else if (mode === "achievement") {
    prompt = `Based on this professional's role (${client.voice_role}) and the following achievement or experience they described:

${original_text}

Write a LinkedIn post that shares this as a professional insight or lesson learned.
Turn the achievement into something valuable for the reader, not just a brag.
Make it specific, grounded, and human.

${samplePosts ? "Match this writing style:\n" + samplePosts : ""}`;
  }

  const systemPrompt = `You are writing a LinkedIn post for ${client.voice_name}, a ${client.voice_role}.

Voice: ${effectivePostTone || "direct and human"}
Rules: ${effectivePostRules || "no buzzwords, no corporate language"}

POST RULES:
1. No markdown - no **bold**, no bullets with dashes or asterisks
2. No hashtags, no emojis
3. No em dashes in the body
4. Short paragraphs, one idea each
5. Never start with "I"
6. 100-220 words maximum
7. Have a clear point of view
8. Return ONLY the post text, nothing else`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const draft = (response.content[0] as { text: string }).text.trim();

  const topic = mode === "repurpose"
    ? "Fresh angle: " + original_text.slice(0, 50)
    : "From achievement: " + original_text.slice(0, 50);

  const { data: interaction } = await supabase
    .from("interactions")
    .insert({
      id: randomUUID(),
      client_id: client.id,
      type: "post_draft",
      name: client.voice_name,
      role: client.voice_role,
      text: topic,
      reply: draft,
      original_draft: draft,
      status: "pending",
      classification: "post",
      intent: topic,
      requires_human: true,
      confidence: 100,
      source_account_id: client.unipile_account_id,
    })
    .select()
    .single();

  return NextResponse.json({ id: interaction?.id, draft, topic });
}
