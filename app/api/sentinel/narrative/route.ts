// Sentinel — narrative generation. The one server-side step: it needs
// ANTHROPIC_API_KEY. Two-turn pattern ported verbatim from the Python
// generator: Turn 1 asks for a hypothesis from the company's own data
// and ALL its flags together (so related flags get connected, not
// explained in isolation); Turn 2 hands over peer context per flagged
// metric and asks whether it CONFIRMS, RULES OUT, or points elsewhere.
//
// Unlike Engage's older routes, this one verifies the caller's Supabase
// JWT before doing anything — narrative generation spends real API
// tokens, and the review row it writes must belong to a real user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runAllChecks } from "../../../sentinel/lib/anomaly";
import { buildPeerTable, findPriorYear } from "../../../sentinel/lib/engine";
import { SECTOR_CONFIG } from "../../../sentinel/lib/config";
import type {
  AnomalyFlag,
  FinancialStatement,
  PeerRow,
} from "../../../sentinel/lib/types";

const MODEL = "claude-sonnet-5";

const inr = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;

function companyContext(
  stmt: FinancialStatement,
  prior: FinancialStatement | null
): string {
  const lines = [
    `${stmt.company_name} (${stmt.period_label}, ${stmt.basis}):`,
    `  Revenue: ${inr(stmt.revenue_from_operations)}`,
    `  PAT: ${inr(stmt.profit_after_tax)}`,
    `  PBT: ${inr(stmt.profit_before_tax)}`,
  ];
  if (stmt.exceptional_items) {
    lines.push(`  Exceptional items: ${inr(stmt.exceptional_items)}`);
  }
  if (prior) {
    lines.push(
      `  Prior year (${prior.period_label}): Revenue ${inr(prior.revenue_from_operations)}, ` +
        `PAT ${inr(prior.profit_after_tax)}`
    );
  }
  return lines.join("\n");
}

function peerContextForMetrics(
  rows: PeerRow[],
  metrics: string[],
  flaggedCompanyId: string
): string {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const metric of metrics) {
    if (seen.has(metric)) continue;
    seen.add(metric);
    const isRatio =
      metric.includes("yoy") || metric.includes("margin") || metric.includes("pct");
    const lines = rows
      .filter((r) => r.ratios[metric] != null)
      .sort((a, b) => (b.ratios[metric] ?? 0) - (a.ratios[metric] ?? 0))
      .map((r) => {
        const v = r.ratios[metric] as number;
        const formatted = isRatio
          ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`
          : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const marker = r.company_id === flaggedCompanyId ? " <- flagged company" : "";
        return `  ${r.company_name}: ${formatted}${marker}`;
      });
    sections.push(`${metric}:\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

async function callClaude(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  // content[0] is NOT reliably the text block (thinking blocks can lead) —
  // scan for the first text block, same fix as the Python version's
  // extract_text after the real ThinkingBlock crash.
  const textBlock = (data.content ?? []).find(
    (b: { type?: string }) => b.type === "text"
  );
  if (!textBlock) {
    throw new Error("No text block in Anthropic response");
  }
  return textBlock.text as string;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const userId = userData.user.id;

  const { company_id, period_label } = await req.json();
  if (!company_id || !period_label) {
    return NextResponse.json(
      { error: "Missing company_id or period_label" },
      { status: 400 }
    );
  }

  // Server-side recompute from the user's visible statements (demo + own) —
  // never trust flag payloads sent from the browser.
  const { data: stmtData, error: stmtError } = await supabase
    .from("sentinel_statements")
    .select("*")
    .or(`owner_id.is.null,owner_id.eq.${userId}`);
  if (stmtError) {
    return NextResponse.json({ error: stmtError.message }, { status: 500 });
  }
  const statements = (stmtData ?? []) as FinancialStatement[];

  const peerRows = buildPeerTable(statements, "FY");
  const allFlags = runAllChecks(peerRows);
  const flags: AnomalyFlag[] = allFlags.filter(
    (f) => f.company_id === company_id && f.period_label === period_label
  );
  if (flags.length === 0) {
    return NextResponse.json(
      { error: "No flags for this company/period" },
      { status: 404 }
    );
  }

  const stmt = statements.find(
    (s) => s.company_id === company_id && s.period_label === period_label
  );
  if (!stmt) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }
  const prior = findPriorYear(stmt, statements);

  const systemPrompt =
    `You are a financial analyst covering the ${SECTOR_CONFIG.display_name} sector.\n\n` +
    `${SECTOR_CONFIG.narrative_context}\n\n` +
    "Be concrete and specific. Do not pad with generic caveats. If the data doesn't " +
    "support a confident conclusion, say what additional information would resolve it. " +
    "If multiple flags are given, consider whether they're connected before treating them " +
    "as separate stories.";

  const flagsBlock = flags.map((f) => `- ${f.description}`).join("\n");
  const plural = flags.length > 1 ? "flags were" : "flag was";

  const turn1User =
    `${flags.length} ${plural} raised for ${stmt.company_name} (${period_label}):\n${flagsBlock}\n\n` +
    `Company data:\n${companyContext(stmt, prior)}\n\n` +
    "Based only on this company's own data, what's your initial hypothesis for " +
    "why this happened? If there's more than one flag, say whether you think they're " +
    "connected or separate issues. 2-4 sentences.";

  try {
    const hypothesis = await callClaude(
      systemPrompt,
      [{ role: "user", content: turn1User }],
      500
    );

    const metrics = flags.map((f) => f.metric);
    const peerContext = peerContextForMetrics(peerRows, metrics, company_id);
    const turn2User =
      `Here's how each flagged metric compares across the sector peer set for the same period:\n\n` +
      `${peerContext}\n\n` +
      "Does this peer context CONFIRM your hypothesis (a sector-wide effect), RULE IT OUT " +
      "(this looks company-specific), or point to something else? State which of the three " +
      "explicitly, then give your final analyst narrative in 3-5 sentences covering all the " +
      "flags together.";

    const finalNarrative = await callClaude(
      systemPrompt,
      [
        { role: "user", content: turn1User },
        { role: "assistant", content: hypothesis },
        { role: "user", content: turn2User },
      ],
      700
    );

    const { error: upsertError } = await supabase
      .from("sentinel_reviews")
      .upsert(
        {
          owner_id: userId,
          company_id,
          company_name: stmt.company_name,
          status: "pending",
          flags,
          initial_hypothesis: hypothesis,
          ai_narrative: finalNarrative,
          final_narrative: null,
          reviewer_notes: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,company_id" }
      );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ status: "drafted" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 502 }
    );
  }
}
