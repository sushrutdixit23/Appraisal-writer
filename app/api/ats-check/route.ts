import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) resume auditor. You analyze a resume's text (and optionally a target job description) and score how well it would parse and rank in a typical ATS, then in a human recruiter's quick scan.

Return ONLY valid JSON - no markdown code fences, no commentary before or after - matching exactly this shape:

{
  "score": <integer 0-100>,
  "verdict": "<one sentence, direct, no hedging>",
  "formatting": [{ "issue": "<specific problem found>", "fix": "<concrete instruction>" }],
  "missing_sections": ["<standard resume section that is absent or too thin>"],
  "keyword_matches": { "matched": ["<keyword found in both resume and JD>"], "missing": ["<keyword in JD but absent from resume>"] } or null if no job description was provided,
  "phrasing": [{ "original": "<weak phrase or bullet quoted verbatim from the resume>", "fix": "<stronger rewrite>" }]
}

Scoring rules:
1. Start from 100 and deduct for real problems: non-standard section headers, missing contact info, likely table/column layouts (flag common ATS-breaking text patterns like tab-separated columns), missing dates, vague bullets with no outcome, absence of a skills section, and - if a JD was given - low keyword overlap.
2. Never invent content that is not in the resume. Only flag and quote what is actually present.
3. formatting and phrasing arrays: 3 to 6 items each, most impactful only - not an exhaustive line-by-line audit.
4. missing_sections: only standard sections genuinely absent (Summary, Skills, Experience, Education, Certifications where relevant).
5. If no job description is provided, keyword_matches must be null - do not guess at a role.
6. Quote phrasing.original directly from the resume text given, verbatim, so the user can find it.`;

export async function POST(req: Request) {
  try {
    const { resumeText, jobDescription } = await req.json();

    if (!resumeText?.trim()) {
      return NextResponse.json({ error: "Paste your resume text first." }, { status: 400 });
    }
    if (resumeText.length > 8000) {
      return NextResponse.json({ error: "Resume text too long. Keep it under 8000 characters." }, { status: 400 });
    }
    if (jobDescription && jobDescription.length > 4000) {
      return NextResponse.json({ error: "Job description too long. Keep it under 4000 characters." }, { status: 400 });
    }

    const userMessage = jobDescription?.trim()
      ? `RESUME:\n${resumeText}\n\nTARGET JOB DESCRIPTION:\n${jobDescription}`
      : `RESUME:\n${resumeText}\n\n(No job description provided - skip keyword matching.)`;

    let raw: string;
    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1536,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      raw = (message.content[0] as any).text;
    } catch (claudeError) {
      return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
    }

    let parsed;
    try {
      const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Could not parse results. Please try again." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
