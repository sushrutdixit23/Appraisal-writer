import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a precise resume data extractor. You receive raw resume text and convert it into structured JSON, preserving the candidate's original wording and facts exactly as given - this is a faithful extraction task, NOT a rewriting or optimization task.

CRITICAL RULES:
1. Never invent, add, improve, or rephrase any content. Copy wording as close to the original as reasonably possible while fitting it into the schema fields.
2. Never invent employers, dates, degrees, certifications, or any fact not present in the source text.
3. If a field genuinely has no corresponding content in the source, use an empty string or empty array - do not guess or fabricate to fill it in.
4. Preserve contact information (phone, email, location, LinkedIn) exactly as written.

Return ONLY valid JSON - no markdown code fences, no commentary - matching exactly this shape:

{
  "name": "<candidate's full name, exactly as given>",
  "title": "<a short professional headline/current role if genuinely evident - empty string if not>",
  "contact": {
    "phone": "<exactly as given, empty string if absent>",
    "email": "<exactly as given, empty string if absent>",
    "location": "<exactly as given, empty string if absent>",
    "linkedin": "<exactly as given, empty string if absent>"
  },
  "summary": "<the summary/objective text, exactly as given, empty string if absent>",
  "skills": [
    { "category": "<category name as given, or 'Skills' if not categorized>", "items": "<comma-separated skills, as given>" }
  ],
  "experience": [
    { "title": "<job title>", "company": "<company name>", "dates": "<date range exactly as given>", "bullets": ["<bullet exactly as given>"] }
  ],
  "education": [
    { "degree": "<degree/program exactly as given>", "institution": "<institution name>", "dates": "<date range>" }
  ],
  "certifications": ["<certification exactly as given>"],
  "additional": ["<any other genuinely present content that doesn't fit the sections above, as given>"]
}

Order experience and education most recent first, matching the source document's own ordering.`;

export async function POST(req: Request) {
  try {
    const { resumeText } = await req.json();

    if (!resumeText?.trim()) {
      return NextResponse.json({ error: "No resume text provided." }, { status: 400 });
    }
    if (resumeText.length > 8000) {
      return NextResponse.json({ error: "Resume text too long. Keep it under 8000 characters." }, { status: 400 });
    }

    const userMessage = `RESUME TEXT TO EXTRACT:\n${resumeText}`;

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
        console.error("Resume extract: response was TRUNCATED (hit max_tokens). Raw so far:", raw);
      }
      if (!raw) {
        console.error("Resume extract: no text block in Claude response. Content:", JSON.stringify(message.content));
      }
    } catch (claudeError: any) {
      console.error("Resume extract: Claude API call failed:", claudeError?.message || claudeError, claudeError?.status ? `(status ${claudeError.status})` : "");
      return NextResponse.json({ error: "Extraction failed. Please try again." }, { status: 500 });
    }

    if (!raw) {
      return NextResponse.json({ error: "Extraction failed. Please try again." }, { status: 500 });
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
      console.error("Resume extract: failed to parse model output:", raw);
      return NextResponse.json({ error: "Could not parse extracted data. Please try again." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
