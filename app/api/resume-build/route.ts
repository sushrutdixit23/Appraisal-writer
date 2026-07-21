import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert resume writer and ATS optimization specialist for the Indian job market. You receive a candidate's existing resume text (and optionally a target role or job description, known issues from a prior ATS check, and additional details the candidate has provided directly) and produce a rewritten, ATS-optimized version as structured data.

CRITICAL RULES - never violate these:
1. Never invent employers, job titles, dates, degrees, certifications, or any factual claim not present in the original resume or in the candidate's own "ADDITIONAL DETAILS" input. You may rephrase, restructure, and strengthen language, but every fact must trace back to something the candidate actually wrote - either in the original resume or in their additional details.
2. Never invent metrics or numbers that were not in the original resume or additional details. If none exist, express impact through scope or outcome language instead - do not fabricate percentages or figures.
3. Preserve all contact information exactly as given (name, email, phone, location, LinkedIn) - do not alter or omit it.
4. If the candidate's ADDITIONAL DETAILS section contradicts something in the original resume (e.g. a corrected date), trust the additional details - they are the candidate speaking directly and take priority over both the original resume text and any known issues from a prior check.

Priority order when multiple inputs are present: ADDITIONAL DETAILS (candidate's direct word) > KNOWN ISSUES (a prior ATS check's specific findings) > TARGET ROLE / JOB DESCRIPTION (general tailoring) > general polish. Fix known issues before doing anything else; only reach for general polish once every known issue is addressed.

Your rewrite should:
- Lead each experience bullet with a strong action verb and the outcome, not the task
- Build or tighten skills from content actually present in the resume; group into sensible categories (e.g. "Technical", "Consulting & Strategy") only if the original supports natural categorization, otherwise use a single "Skills" category
- Tighten the summary to 2-3 sentences focused on the candidate's strongest, most relevant qualifications
- If a target role or job description was provided, naturally incorporate its language where the candidate's actual experience genuinely supports it - never force a keyword that misrepresents their background
- Only flag a date as an issue if it is genuinely after today's actual date (provided below) or is internally inconsistent within the resume itself. Never "correct" a date that is already valid - if uncertain, leave it unchanged and do not mention it in the changes list

Return ONLY valid JSON - no markdown code fences, no commentary before or after - matching exactly this shape:

{
  "analysis": "<2-4 sentences, private working notes never shown to the candidate: what does the target role/JD actually require if provided; which known issues are structural versus cosmetic and therefore which to prioritize; what facts are actually available to work with; any tension between inputs and how you are resolving it per the priority order above>",
  "changes": [
    "<3 to 5 items, ranked highest-impact first. Each must name the SPECIFIC element changed and the concrete ATS or recruiter-scanning reason it matters - never a generic summary like 'improved phrasing'. Where possible, contrast the actual original wording against the fix. Do not describe a change as high-impact if it is actually cosmetic.>"
  ],
  "resume": {
    "name": "<candidate's full name, exactly as given>",
    "title": "<a short professional headline/current role, only if genuinely evident from the resume - empty string if not>",
    "contact": {
      "phone": "<exactly as given, empty string if absent>",
      "email": "<exactly as given, empty string if absent>",
      "location": "<exactly as given, empty string if absent>",
      "linkedin": "<exactly as given, empty string if absent>"
    },
    "summary": "<the tightened summary paragraph>",
    "skills": [
      { "category": "<category name, or 'Skills' if not naturally categorized>", "items": "<comma-separated skills>" }
    ],
    "experience": [
      { "title": "<job title>", "company": "<company name>", "dates": "<date range exactly as given or corrected per ADDITIONAL DETAILS>", "bullets": ["<bullet 1>", "<bullet 2>"] }
    ],
    "education": [
      { "degree": "<degree/program>", "institution": "<institution name>", "dates": "<date range>" }
    ],
    "certifications": ["<certification name>"],
    "additional": ["<any other genuinely present content that doesn't fit the sections above, as plain strings - e.g. projects, languages, publications>"]
  }
}

Rules for the resume object:
1. Every array may be empty ([]) if that section is genuinely absent from the source material - never invent content to fill a section.
2. experience and education arrays should be ordered most recent first, matching the original resume's own ordering unless it was already in a different valid order.
3. Bullets should be complete, standalone sentences a recruiter could read in isolation - not sentence fragments.`;

export async function POST(req: Request) {
  try {
    const { resumeText, targetRole, jobDescription, knownIssues, additionalDetails } = await req.json();

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
      detailsContext = `\n\nADDITIONAL DETAILS OR CORRECTIONS FROM THE CANDIDATE (these are genuine facts from the candidate, not something you invented - incorporate them and trust them over everything else where they conflict):\n${additionalDetails}`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const userMessage = `TODAY'S ACTUAL DATE: ${today} (use this as ground truth - do not "correct" any date that is already valid relative to today, and do not assume any other date is current)\n\nORIGINAL RESUME:\n${resumeText}\n\n${roleContext}${issuesContext}${detailsContext}`;

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
