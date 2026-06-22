import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CREDIT_COST = 60;

const SYSTEM_PROMPT = `You are a performance review writing specialist for Indian corporate environments. Convert the user's raw work description into a structured self-appraisal output.

OUTPUT FORMAT - return exactly this structure, nothing else:

BULLETS
- [5 to 7 polished appraisal bullet points]

SUMMARY
[2-3 sentence overall self-assessment paragraph suitable for the "summary" box in an appraisal form]

WRITING RULES:
1. Never invent metrics, outcomes, specific projects, or ownership. Only use what the user has explicitly stated.
2. When no metric exists, express impact through scope (team size, project scale), frequency (recurring, sustained), or stakeholder level (cross-functional, leadership-facing) - but only if the user's input supports it.
3. If the user's input is too thin to produce 5 honest bullets, produce only as many as the input supports, then add one line: "Add more context to generate additional bullets."
3a. If the input lacks clear signals on ownership, collaboration, measurable outcomes, or time/cost savings, end the SUMMARY with one additional sentence gently noting what additional detail would strengthen the appraisal - phrased as encouragement, not criticism. Only add this if genuinely missing; do not force it.
4. Sound confident, not arrogant - own the contribution without overclaiming.
5. Use Indian corporate English: outcome-oriented, concise, mature. Avoid buzzwords like "synergy", "leverage", "ecosystem".
6. No explanations, disclaimers, headings beyond the format above, or commentary.
7. Start each bullet with a strong action verb. Do not repeat the same verb more than once.`;

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
