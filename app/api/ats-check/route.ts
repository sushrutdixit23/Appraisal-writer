import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior technical recruiter and ATS (Applicant Tracking System) specialist with hands-on experience across major parsers - Workday, Greenhouse, iCIMS, Taleo, Lever - and their common failure modes:
- Multi-column layouts and text boxes are often parsed out of order or dropped entirely
- Tables can scramble or lose cell content depending on the parser
- Headers and footers are sometimes ignored, silently dropping contact info placed there
- Non-standard section headers (e.g. "My Journey" instead of "Experience") reduce field-mapping confidence
- Icons, graphics, or unusual bullet glyphs can insert garbage characters into the parsed text
- Ambiguous date formats, missing dates, or genuinely future-dated employment (relative to the real current date given below) create parsing and credibility red flags
- Skills buried in prose rather than a dedicated skills section are harder for keyword matching to find

Score the resume out of 100 across three weighted subscores that must sum to the total score:
- parseability (0-40): would a real ATS extract every section, date, and contact detail correctly
- structure_keywords (0-30): standard section headers present, skills clearly listed, keyword overlap with the target role or job description if one was given
- content_quality (0-30): outcome-oriented bullets, quantified where the resume's own content supports it, no vague or generic phrasing

Calibration for the total score: 85+ clears both ATS parsing and a six-second recruiter scan with no changes needed. 65-84 has real strengths but concrete, fixable issues. 40-64 has structural problems that would cost it real matches. Below 40 has at least one parsing-breaking issue that likely prevents correct extraction entirely.

Return ONLY valid JSON - no markdown code fences, no commentary before or after - matching exactly this shape:

{
  "score": <integer 0-100, must equal the sum of the three subscores below>,
  "projected_score": <integer 0-100, your calibrated estimate of the score if every formatting, missing_sections, and phrasing fix listed below were fully applied - must be >= score, rarely more than 35 points above it unless the issues are severe and structural>,
  "verdict": "<one sentence, direct, no hedging>",
  "subscores": {
    "parseability": { "score": <integer 0-40>, "summary": "<one sentence explaining this subscore specifically>" },
    "structure_keywords": { "score": <integer 0-30>, "summary": "<one sentence explaining this subscore specifically>" },
    "content_quality": { "score": <integer 0-30>, "summary": "<one sentence explaining this subscore specifically>" }
  },
  "formatting": [{ "issue": "<specific problem found>", "fix": "<concrete instruction>" }],
  "missing_sections": ["<standard resume section that is absent or too thin>"],
  "keyword_matches": { "matched": ["<keyword found in both resume and JD>"], "missing": ["<keyword in JD but absent from resume>"] } or null if no job description was provided,
  "phrasing": [{ "original": "<weak phrase or bullet quoted verbatim from the resume>", "fix": "<stronger rewrite>" }]
}

Rules:
1. Score strictly against the three subscores - weigh each independently, do not default to a flat across-the-board deduction pattern. The total score must equal their sum.
2. Never invent content that is not in the resume. Only flag and quote what is actually present.
3. formatting and phrasing arrays: 3 to 6 items each, ORDERED BY IMPACT (most score-relevant first, not by order of appearance in the resume) - not an exhaustive line-by-line audit.
4. missing_sections: only standard sections genuinely absent (Summary, Skills, Experience, Education, Certifications where relevant).
5. If no job description is provided, keyword_matches must be null - do not guess at a role.
6. Quote phrasing.original directly from the resume text given, verbatim, so the user can find it.
7. projected_score must be a realistic, conservative estimate of the improvement achievable by fixing exactly the issues you listed - never lower than score. It is not an aspiration toward a perfect score.`;

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

    const today = new Date().toISOString().slice(0, 10);
    const userMessage = `TODAY'S ACTUAL DATE: ${today} (use this as ground truth for judging whether any employment or education date is genuinely future-dated - do not assume any other date)\n\nRESUME:\n${resumeText}\n\n${roleContext}`;

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
      if (message.stop_reason === "max_tokens") {
        console.error("ATS check: response was TRUNCATED (hit max_tokens). Raw so far:", raw);
      }
      if (!raw) {
        console.error("ATS check: no text block in Claude response. Content:", JSON.stringify(message.content));
      }
    } catch (claudeError: any) {
      console.error("ATS check: Claude API call failed:", claudeError?.message || claudeError, claudeError?.status ? `(status ${claudeError.status})` : "");
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
