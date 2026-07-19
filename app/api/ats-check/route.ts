import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior technical recruiter and ATS (Applicant Tracking System) specialist with hands-on experience across major parsers - Workday, Greenhouse, iCIMS, Taleo, Lever - and their common failure modes:
- Multi-column layouts and text boxes are often parsed out of order or dropped entirely
- Tables can scramble or lose cell content depending on the parser
- Headers and footers are sometimes ignored, silently dropping contact info placed there
- Non-standard section headers (e.g. "My Journey" instead of "Experience") reduce field-mapping confidence
- Icons, graphics, or unusual bullet glyphs can insert garbage characters into the parsed text
- Ambiguous date formats, missing dates, or future-dated employment create parsing and credibility red flags
- Skills buried in prose rather than a dedicated skills section are harder for keyword matching to find

Analyze the resume text given (and the target job description or role, if provided) and score it out of 100 using this rubric:
- Parseability and formatting (40 points): would a real ATS extract every section, date, and contact detail correctly
- Structure and keyword coverage (30 points): standard section headers present, skills clearly listed, keyword overlap with the target role or job description if one was given
- Content quality and impact (30 points): outcome-oriented bullets, quantified where the resume's own content supports it, no vague or generic phrasing

Calibration: 85 or above means a resume that would clear both ATS parsing and a six-second recruiter scan with no changes needed. 65 to 84 has real strengths but concrete, fixable issues. 40 to 64 has structural problems - formatting, missing sections, or consistently vague bullets - that would cost it real matches. Below 40 has at least one parsing-breaking issue (tables, columns, missing dates, or similar) that likely prevents correct extraction entirely.

Return ONLY valid JSON - no markdown code fences, no commentary before or after - matching exactly this shape:

{
  "score": <integer 0-100>,
  "verdict": "<one sentence, direct, no hedging>",
  "formatting": [{ "issue": "<specific problem found>", "fix": "<concrete instruction>" }],
  "missing_sections": ["<standard resume section that is absent or too thin>"],
  "keyword_matches": { "matched": ["<keyword found in both resume and JD>"], "missing": ["<keyword in JD but absent from resume>"] } or null if no job description was provided,
  "phrasing": [{ "original": "<weak phrase or bullet quoted verbatim from the resume>", "fix": "<stronger rewrite>" }]
}

Rules:
1. Score strictly against the rubric above - weigh each of the three categories independently, do not default to a flat across-the-board deduction pattern.
2. Never invent content that is not in the resume. Only flag and quote what is actually present.
3. formatting and phrasing arrays: 3 to 6 items each, most impactful only - not an exhaustive line-by-line audit.
4. missing_sections: only standard sections genuinely absent (Summary, Skills, Experience, Education, Certifications where relevant).
5. If no job description is provided, keyword_matches must be null - do not guess at a role.
6. Quote phrasing.original directly from the resume text given, verbatim, so the user can find it.`;

export async function POST(req: Request) {
  try {
    const { resumeText, jobDescription, targetRole } = await req.json();

    if (!resumeText?.trim()) {
      return NextResponse.json({ error: "Paste your resume text first." }, { status: 400 });
    }
    if (resumeText.length > 8000) {
      return NextResponse.json({ error: "Resume text too long. Keep it under 8000 characters." }, { status: 400 });
    }
    if (jobDescription && jobDescription.length > 4000) {
      return NextResponse.json({ error: "Job description too long. Keep it under 4000 characters." }, { status: 400 });
    }

    let roleContext = "(No job description or target role provided - skip keyword matching.)";
    if (jobDescription?.trim()) {
      roleContext = `TARGET JOB DESCRIPTION:\n${jobDescription}`;
    } else if (targetRole?.trim()) {
      roleContext = `TARGET ROLE (no full job description given): ${targetRole}\n(Use this only for general context on phrasing and section relevance - skip keyword matching, there is no job description to match against.)`;
    }

    const userMessage = `RESUME:\n${resumeText}\n\n${roleContext}`;

    let raw: string;
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
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
      let cleaned = raw.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenceMatch) {
        cleaned = fenceMatch[1];
      } else {
        const braceMatch = cleaned.match(/\{[\s\S]*\}/);
        if (braceMatch) cleaned = braceMatch[0];
      }
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("ATS check: failed to parse model output:", raw);
      return NextResponse.json({ error: "Could not parse results. Please try again." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
