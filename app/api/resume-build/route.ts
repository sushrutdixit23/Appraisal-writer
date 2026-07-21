import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_MODES = ["general", "consulting", "software", "data", "product", "finance", "marketing", "government", "startup"];

const MODE_GUIDANCE: Record<string, string> = {
  general: "No specific industry mode selected - optimize for broad professional standards.",
  consulting: "CONSULTING MODE: structured, outcome-first bullets; frameworks and client impact language; quantified engagement outcomes; concise executive tone. Recruiters here scan for client-facing scope, deliverables, and measurable business impact.",
  software: "SOFTWARE ENGINEERING MODE: technologies named precisely; system scale and performance outcomes; shipped features over responsibilities; active technical verbs (built, shipped, designed, debugged). Recruiters scan for stack, scale, and ownership.",
  data: "DATA / ANALYTICS MODE: tools and methods named precisely (SQL, Python, dashboards, models); insights tied to business decisions; quantified analytical impact. Recruiters scan for technical depth plus business translation.",
  product: "PRODUCT MODE: user and business outcomes over features; metrics like adoption, retention, conversion; cross-functional leadership language. Recruiters scan for impact ownership and decision-making.",
  finance: "FINANCE / ACCOUNTING MODE: precision and compliance language; quantified amounts, reconciliations, reporting cadences; conservative professional tone. Recruiters scan for accuracy, scale of figures handled, and regulatory awareness.",
  marketing: "MARKETING MODE: campaign outcomes with numbers (reach, conversion, ROI); channel expertise named; growth language. Recruiters scan for measurable results and channel breadth.",
  government: "GOVERNMENT / PUBLIC SECTOR MODE: formal tone; policy, compliance, and stakeholder language; scale of programs and populations served; avoid startup jargon entirely.",
  startup: "STARTUP MODE: breadth and ownership emphasized; built-from-zero language; scrappiness with outcomes; comfort with ambiguity made evident. Recruiters scan for range and self-direction.",
};

const SYSTEM_PROMPT = `You are an expert resume writer and ATS optimization specialist for the Indian job market. You receive a candidate's existing resume text (and optionally a target role or job description, an industry optimization mode, known issues from a prior ATS check, and additional details the candidate provided directly) and produce a rewritten, ATS-optimized version as structured data.

CRITICAL RULES - never violate these:
1. Never invent employers, job titles, dates, degrees, certifications, or any factual claim not present in the original resume or the candidate's ADDITIONAL DETAILS. Every fact must trace back to something the candidate actually wrote.
2. Never invent metrics or numbers not in the original resume or additional details. If none exist, express impact through scope or outcome language - do not fabricate figures.
3. Preserve all contact information exactly as given.
4. If ADDITIONAL DETAILS contradicts the original resume, trust the additional details - the candidate speaking directly takes priority over everything.

Priority order: ADDITIONAL DETAILS > KNOWN ISSUES > TARGET ROLE / JOB DESCRIPTION / OPTIMIZATION MODE > general polish.

Your rewrite should:
- Follow the OPTIMIZATION MODE guidance given below, where one is provided
- Lead each experience bullet with a strong action verb and the outcome, not the task
- Build or tighten skills from content actually present; categorize only if natural
- Tighten the summary to 2-3 sentences on the strongest, most relevant qualifications
- Incorporate target role/JD language only where the candidate's actual experience genuinely supports it
- Only flag a date as an issue if genuinely after today's date (given below) or internally inconsistent; never "correct" a valid date

Return ONLY valid JSON - no markdown code fences, no commentary - matching exactly this shape:

{
  "analysis": "<2-4 sentences, private working notes: what the target role/mode requires; which known issues are structural vs cosmetic; what facts are available; how conflicts were resolved>",
  "changes": [
    {
      "original": "<the actual wording from the original resume, quoted verbatim - or a short description like 'No skills section' when the change is structural rather than a rewording>",
      "optimized": "<the new wording, or a short description of what was added/restructured>",
      "reason": "<one sentence: the concrete ATS or recruiter-scanning reason this specific change matters>"
    }
  ],
  "resume": {
    "name": "<exactly as given>",
    "title": "<short professional headline if genuinely evident, else empty string>",
    "contact": { "phone": "<as given>", "email": "<as given>", "location": "<as given>", "linkedin": "<as given>" },
    "summary": "<the tightened summary>",
    "skills": [{ "category": "<name or 'Skills'>", "items": "<comma-separated>" }],
    "experience": [{ "title": "<title>", "company": "<company>", "dates": "<as given or corrected per ADDITIONAL DETAILS>", "bullets": ["<bullet>"] }],
    "education": [{ "degree": "<degree>", "institution": "<institution>", "dates": "<dates>" }],
    "certifications": ["<certification>"],
    "additional": ["<other genuine content>"]
  }
}

Rules for changes array: 4 to 7 entries, ranked highest-impact first. Each original must be verifiable against the source resume. Do not present cosmetic changes as high-impact - omit them or place them last. This is a precise, checkable diff, not a marketing summary.
Rules for resume object: arrays may be empty if the section is genuinely absent - never pad. Experience and education most recent first. Bullets are complete standalone sentences.`;

export async function POST(req: Request) {
  try {
    const { resumeText, targetRole, jobDescription, knownIssues, additionalDetails, mode } = await req.json();

    if (!resumeText?.trim()) {
      return NextResponse.json({ error: "Paste or upload your resume first." }, { status: 400 });
    }
    if (resumeText.length > 8000) {
      return NextResponse.json({ error: "Resume text too long. Keep it under 8000 characters." }, { status: 400 });
    }
    if (jobDescription && jobDescription.length > 4000) {
      return NextResponse.json({ error: "Job description too long. Keep it under 4000 characters." }, { status: 400 });
    }
    if (additionalDetails && additionalDetails.length > 2000) {
      return NextResponse.json({ error: "Additional details too long. Keep it under 2000 characters." }, { status: 400 });
    }

    const selectedMode = VALID_MODES.includes(mode) ? mode : "general";

    let roleContext = "(No target role or job description provided - optimize generally.)";
    if (jobDescription?.trim()) {
      roleContext = `TARGET JOB DESCRIPTION:\n${jobDescription}`;
    } else if (targetRole?.trim()) {
      roleContext = `TARGET ROLE: ${targetRole}`;
    }

    let issuesContext = "";
    if (knownIssues?.trim()) {
      issuesContext = `\n\nKNOWN ISSUES FROM A PRIOR ATS CHECK (prioritize fixing these specifically):\n${knownIssues}`;
    }

    let detailsContext = "";
    if (additionalDetails?.trim()) {
      detailsContext = `\n\nADDITIONAL DETAILS OR CORRECTIONS FROM THE CANDIDATE (genuine facts from the candidate - trust them over everything else where they conflict):\n${additionalDetails}`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const userMessage = `TODAY'S ACTUAL DATE: ${today} (ground truth - do not "correct" any date already valid relative to today)\n\nOPTIMIZATION MODE: ${MODE_GUIDANCE[selectedMode]}\n\nORIGINAL RESUME:\n${resumeText}\n\n${roleContext}${issuesContext}${detailsContext}`;

    let raw = "";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const textBlock = message.content.find((block: any) => block.type === "text") as any;
      raw = textBlock?.text ?? "";
      if (message.stop_reason === "max_tokens") {
        console.error("Resume build: response was TRUNCATED (hit max_tokens). Raw so far:", raw);
      }
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
      console.error("Resume build: failed to parse model output:", raw);
      return NextResponse.json({ error: "Could not parse results. Please try again." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
