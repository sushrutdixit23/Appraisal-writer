import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CREDIT_COST = 60;

const SYSTEM_PROMPT = `You are a senior performance review specialist for Indian corporate environments. You receive structured answers from an employee and produce a polished appraisal in three sections.

Output format — use these exact headings, nothing else:

ACHIEVEMENTS
- [4 to 6 polished, quantified bullet points. Lead with the outcome, then the action. Use Indian corporate English — concise, mature, outcome-oriented. Avoid buzzwords like synergy, leverage, ecosystem.]

SUMMARY
[2 to 3 sentences. A confident self-assessment paragraph suitable for the summary box in an appraisal form. Write in first person. Reflect the employee's tone and voice.]

GROWTH
[1 to 2 sentences on the most significant challenge they navigated and what it demonstrated about their capability. Skip this section entirely if no meaningful challenge was provided.]

Rules:
1. Write in the employee's voice — match their tone (conservative, confident, or senior based on context clues).
2. If metrics are provided, weave them into the ACHIEVEMENTS bullets naturally.
3. If the input is thin, produce only honest bullets the input supports. Do not pad or invent.
4. Never use phrases like "I am a team player", "go-getter", "passionate about", or similar clichés.
5. The ACHIEVEMENTS bullets should each stand alone — a recruiter or manager should understand each one without reading the others.
`

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { jobTitle, tone, rawInput } = await req.json();

    if (!jobTitle?.trim() || !rawInput?.trim()) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }
    if (rawInput.length > 3000) {
      return NextResponse.json({ error: "Input too long. Keep it under 3000 characters." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, credits")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found. Complete setup first." }, { status: 404 });
    }

    if (profile.credits < CREDIT_COST) {
      return NextResponse.json({
        error: "Not enough credits.",
        credits: profile.credits,
        required: CREDIT_COST,
        code: "INSUFFICIENT_CREDITS"
      }, { status: 402 });
    }

    const { error: deductError } = await supabase.rpc("deduct_credits", {
      p_auth_user_id: user.id,
      p_amount: CREDIT_COST,
      p_description: `Appraisal Writer - ${jobTitle}`
    });

    if (deductError) {
      return NextResponse.json({ error: "Failed to deduct credits. Try again." }, { status: 500 });
    }

    const userMessage = `Role: ${jobTitle}
Tone: ${tone}

Raw input:
${rawInput}`;

    let output: string;

    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      output = (message.content[0] as any).text;
    } catch (claudeError) {
      await supabase.rpc("refund_credits", {
        p_auth_user_id: user.id,
        p_amount: CREDIT_COST,
        p_description: "Refund - Appraisal Writer generation failed"
      });
      return NextResponse.json({
        error: "AI generation failed. Your credits have been refunded.",
        retryable: true
      }, { status: 500 });
    }

    await supabase.from("generations").insert({
      auth_user_id: user.id,
      job_title: jobTitle,
      output,
      status: "complete",
      source: "credits"
    });

    const { data: updated } = await supabase
      .from("profiles")
      .select("credits")
      .eq("auth_user_id", user.id)
      .single();

    return NextResponse.json({ output, credits_remaining: updated?.credits ?? 0 });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

