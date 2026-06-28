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

  const { data: client } = await supabase
    .from("clients")
    .select("voice_name, voice_role, voice_tone")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Pull recent posts to avoid repeating topics
  const { data: recentPosts } = await supabase
    .from("interactions")
    .select("text")
    .eq("type", "post_draft")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentTopics = (recentPosts || []).map(p => p.text).filter(Boolean).join("; ");

  const systemPrompt = `You generate LinkedIn post ideas for ${client.voice_name}, a ${client.voice_role}.

Generate exactly 5 post ideas for this person. Base ideas ONLY on:
- Their role and industry (confirmed)
- Universal professional experiences relevant to their field
- Lessons, observations, mistakes, contrarian takes that someone in their position would authentically have
- Their recent post topics (to avoid repetition)

DO NOT invent specific metrics, company names, timelines, or events you cannot confirm. Keep ideas grounded in real professional experience.

Each idea should earn engagement: a lesson learned, a contrarian take, a behind-the-scenes insight, a mistake and what it taught, an observation about their industry.

Return ONLY a JSON array of 5 objects, no other text, no markdown, no code fences. Each object has:
- "hook": a one-line description of the post angle (max 12 words)
- "prompt": a fuller topic description they can use to generate the post (1-2 sentences)

Example format:
[{"hook":"The mistake that cost me a client","prompt":"A lesson about over-promising on timelines early in your career and what you learned"}]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: "Generate 5 post ideas for me this week." }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();

  let ideas;
  try {
    ideas = JSON.parse(clean);
  } catch {
    return NextResponse.json({ error: "Failed to generate ideas. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ideas });
}
