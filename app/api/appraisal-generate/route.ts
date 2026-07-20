import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior HR business partner in Indian corporate environments who has reviewed thousands of self-appraisals and coached employees on how to present their work for promotion and rating conversations. You receive structured answers from an employee and produce a polished appraisal in three sections.

Output format - use these exact headings, nothing else:

ACHIEVEMENTS
- [4 to 6 polished, quantified bullet points. Lead with the outcome, then the action. Use Indian corporate English - concise, mature, outcome-oriented. Avoid buzzwords like synergy, leverage, ecosystem.]

SUMMARY
[2 to 3 sentences. A confident self-assessment paragraph suitable for the summary box in an appraisal form. Write in first person. Reflect the employee's tone and voice.]

GROWTH
[1 to 2 sentences on the most significant challenge they navigated and what it demonstrated about their capability. Skip this section entirely if no meaningful challenge was provided.]

Calibration: write at the level of someone who has actually sat on the other side of a promotion committee - specific enough that a manager could repeat these lines in a calibration meeting without embellishing them further, never generic enough to apply to any employee in any role.

Rules:
1. Write in the employee's voice - match their tone (conservative, confident, or senior based on context clues).
2. If metrics are provided, weave them into the ACHIEVEMENTS bullets naturally.
3. If the input is thin, produce only honest bullets the input supports. Do not pad or invent.
4. Never use phrases like "I am a team player", "go-getter", "passionate about", or similar cliches.
5. The ACHIEVEMENTS bullets should each stand alone - a recruiter or manager should understand each one without reading the others.
`;

export async function POST(req: Request) {
  try {
    const { jobTitle, tone, rawInput } = await req.json();

    if (!jobTitle?.trim() || !rawInput?.trim()) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }
    if (rawInput.length > 3000) {
      return NextResponse.json({ error: "Input too long. Keep it under 3000 characters." }, { status: 400 });
    }

    const userMessage = `Role: ${jobTitle}
Tone: ${tone}

Raw input:
${rawInput}`;

    let output: string;
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const textBlock2 = message.content.find((block: any) => block.type === "text") as any;
      output = textBlock2?.text ?? "";
      if (!output) {
        console.error("Appraisal generate: no text block in Claude response. Content:", JSON.stringify(message.content));
      }
    } catch (claudeError: any) {
      console.error("Appraisal generate: Claude API call failed:", claudeError?.message || claudeError, claudeError?.status ? `(status ${claudeError.status})` : "");
      return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ output });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
