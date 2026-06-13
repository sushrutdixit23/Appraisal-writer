import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = orderId + "|" + paymentId;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");
  return expected === signature;
}

const SYSTEM_PROMPT = `You are a performance review writing specialist for Indian corporate environments. Convert the user's raw work description into a structured self-appraisal output.

OUTPUT FORMAT — return exactly this structure, nothing else:

BULLETS
- [5 to 7 polished appraisal bullet points]

SUMMARY
[2–3 sentence overall self-assessment paragraph suitable for the "summary" box in an appraisal form]

WRITING RULES:
1. Never invent metrics, outcomes, specific projects, or ownership. Only use what the user has explicitly stated.
2. When no metric exists, express impact through scope (team size, project scale), frequency (recurring, sustained), or stakeholder level (cross-functional, leadership-facing) — but only if the user's input supports it.
3. If the user's input is too thin to produce 5 honest bullets, produce only as many as the input supports, then add one line: "Add more context to generate additional bullets."
4. If the input lacks clear signals on ownership, collaboration, measurable outcomes, or time/cost savings, end the SUMMARY with one additional sentence gently noting what additional detail would strengthen the appraisal — phrased as encouragement, not criticism. Only add this if genuinely missing; don't force it.
5. Sound confident, not arrogant — own the contribution without overclaiming.
6. Use Indian corporate English: outcome-oriented, concise, mature. Avoid buzzwords like "synergy", "leverage", "ecosystem".
7. No explanations, disclaimers, headings beyond the format above, or commentary.
8. Start each bullet with a strong action verb. Do not repeat the same verb more than once.`;

export async function POST(req: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      jobTitle,
      tone,
      rawInput,
    } = await req.json();

    // 1. Verify Razorpay signature
    const valid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Payment verification failed." },
        { status: 400 }
      );
    }

    // 2. Check if already generated — return stored output if yes
    const { data: existing } = await supabase
      .from("generations")
      .select("used, output, status")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .single();

    if (existing?.status === "complete" && existing?.output) {
      return NextResponse.json({ output: existing.output, recovered: true });
    }

    if (existing?.used && existing?.status !== "failed") {
      return NextResponse.json(
        { error: "This payment has already been used." },
        { status: 400 }
      );
    }

    // 3. Upsert row with pending status
    await supabase.from("generations").upsert({
      razorpay_payment_id,
      used: true,
      status: "pending",
      job_title: jobTitle,
    });

    // 4. Call Claude
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
      // Mark as failed so user can retry
      await supabase
        .from("generations")
        .update({ used: false, status: "failed" })
        .eq("razorpay_payment_id", razorpay_payment_id);

      return NextResponse.json(
        {
          error:
            "AI generation failed. Your payment is safe — retry with your payment ID: " +
            razorpay_payment_id,
          payment_id: razorpay_payment_id,
          retryable: true,
        },
        { status: 500 }
      );
    }

    // 5. Store output and mark complete
    await supabase
      .from("generations")
      .update({ output, status: "complete" })
      .eq("razorpay_payment_id", razorpay_payment_id);

    return NextResponse.json({ output });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong. Contact support." },
      { status: 500 }
    );
  }
}