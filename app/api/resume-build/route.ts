import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert resume writer and ATS optimization specialist for the Indian job market. You receive a candidate's existing resume text (and optionally a target role or job description) and produce a rewritten, ATS-optimized version.

CRITICAL RULES - never violate these:
1. Never invent employers, job titles, dates, degrees, certifications, or any factual claim not present in the original resume. You may rephrase, restructure, and strengthen language, but every fact must trace back to something the candidate actually wrote.
2. Never invent metrics or numbers that were not in the original. If the original has no numbers, express impact through scope or outcome language instead - do not fabricate percentages or figures.
3. Preserve all contact information exactly as given (name, email, phone, location) - do not alter or omit it.

Your rewrite should:
- Use a clean, single-column, ATS-parseable structure with standard section headers (Summary, Skills, Experience, Education, and others only if the original supports them)
- Lead each experience bullet with a strong action verb and the outcome, not the task
- Build or tighten a Skills section from content actually present in the resume
- Tighten the Summary to 2-3 sentences focused on the candidate's strongest, most relevant qualifications
- If a target role or job description was provided, naturally incorporate its language where the candidate's actual experience genuinely supports it - never force a keyword that misrepresents their background
- Fix any future-dated or ambiguous employment dates only if the fix is obvious from context (e.g. an evident typo); otherwise flag it in CHANGES rather than silently guessing

Return your response in exactly this format, nothing else:

CHANGES
- [3 to 5 bullet points, each one sentence, summarizing the most impactful improvements made]

RESUME
[the full rewritten resume as plain text, ready to copy into a document]
`;

export async function POST(req: Request) {
  try {
    const { resumeText, targetRole, jobDescription } = await req.json();

    if (!resumeText?.trim()) {
      return NextResponse.json({ error: "Paste or upload your resume first." }, { status: 400 });
    }
    if (resumeText.length > 8000) {
      return NextResponse.json({ error: "Resume text too long. Keep it under 8000 characters." }, { status: 400 });
    }
    if (jobDescription && jobDescription.length > 4000) {
      return NextResponse.json({ error: "Job description too long. Keep it under 4000 characters." }, { status: 400 });
    }

    let roleContext = "(No target role or job description provided - optimize generally.)";
    if (jobDescription?.trim()) {
      roleContext = `TARGET JOB DESCRIPTION:\n${jobDescription}`;
    } else if (targetRole?.trim()) {
      roleContext = `TARGET ROLE: ${targetRole}`;
    }

    const userMessage = `ORIGINAL RESUME:\n${resumeText}\n\n${roleContext}`;

    let raw = "";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const textBlock = message.content.find((block: any) => block.type === "text") as any;
      raw = textBlock?.text ?? "";
      if (!raw) {
        console.error("Resume build: no text block in Claude response. Content:", JSON.stringify(message.content));
      }
    } catch (claudeError: any) {
      console.error("Resume build: Claude API call failed:", claudeError?.message || claudeError, claudeError?.status ? `(status ${claudeError.status})` : "");
      return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
    }

    if (!raw) {
      return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ output: raw });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
