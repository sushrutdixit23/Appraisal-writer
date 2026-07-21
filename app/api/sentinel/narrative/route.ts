// Sentinel — investigation generation. Rebuilt around workspace_id and
// the full chain: Observation (flags, already computed) -> AI Analysis
// (two-turn hypothesis+peer-check, unchanged from Phase 1) -> Suggested
// Questions/Actions (new — a third, tightly-scoped call) -> Confidence
// (computed deterministically via computeConfidence, NEVER asked of
// Claude — see anomaly.ts). Writes to sentinel_investigations, not the
// old sentinel_reviews table.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeConfidence, runAllChecks } from "../../../sentinel/lib/anomaly";
import { buildPeerTable, findPriorYear } from "../../../sentinel/lib/engine";
import { getSectorConfig } from "../../../sentinel/lib/config";
import type {
  AnomalyFlag,
  FinancialStatement,
  PeerRow,
  Workspace,
} from "../../../sentinel/lib/types";

const MODEL = "claude-sonnet-5";

const inr = (v: number) =>
  `\u20b9${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;

function companyContext(
  ws: Workspace,
  stmt: FinancialStatement,
  prior: FinancialStatement | null
): string {
  const lines = [
    `${ws.company_name} (${stmt.period_label}, ${stmt.basis}):`,
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
  flaggedWorkspaceId: string
): string {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const metric of metrics) {
    if (seen.has(metric)) continue;
    seen.add(metric);
    const isRatio = metric.includes("yoy") || metric.includes("margin") || metric.includes("pct");
    const lines = rows
      .filter((r) => r.ratios[metric] != null)
      .sort((a, b) => (b.ratios[metric] ?? 0) - (a.ratios[metric] ?? 0))
      .map((r) => {
        const v = r.ratios[metric] as number;
        const formatted = isRatio
          ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`
          : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const marker = r.workspace_id === flaggedWorkspaceId ? " <- flagged company" : "";
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
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: "disabled" }, system, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: { type?: string }) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Anthropic response");
  return textBlock.text as string;
}

/** Turn 3: suggested questions + actions, as strict JSON. Failure here is
 * non-fatal — an investigation without these is still a complete,
 * approvable finding; it just falls back to empty lists rather than
 * failing the whole generation over a secondary enrichment step. */
async function getSuggestedFollowUps(
  system: string,
  priorMessages: { role: "user" | "assistant"; content: string }[]
): Promise<{ questions: string[]; actions: string[] }> {
  const prompt =
    "Based on your analysis above, list 2-4 specific follow-up questions an analyst " +
    "should ask to verify or refine this finding, and 2-4 concrete next actions. " +
    'Respond with ONLY this JSON shape, no other text: {"questions": ["...","..."], "actions": ["...","..."]}';
  try {
    const raw = await callClaude(system, [...priorMessages, { role: "user", content: prompt }], 400);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const questions = Array.isArray(parsed.questions) ? parsed.questions.filter((q: unknown) => typeof q === "string") : [];
    const actions = Array.isArray(parsed.actions) ? parsed.actions.filter((a: unknown) => typeof a === "string") : [];
    return { questions, actions };
  } catch {
    return { questions: [], actions: [] };
  }
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

  const { workspace_id, period_label } = await req.json();
  if (!workspace_id || !period_label) {
    return NextResponse.json({ error: "Missing workspace_id or period_label" }, { status: 400 });
  }

  const { data: wsData, error: wsError } = await supabase
    .from("sentinel_workspaces")
    .select("*")
    .eq("id", workspace_id)
    .single();
  if (wsError || !wsData) {
    return NextResponse.json({ error: "Workspace not found or not accessible" }, { status: 404 });
  }
  const workspace = wsData as Workspace;

  const { data: allWsData, error: allWsError } = await supabase
    .from("sentinel_workspaces")
    .select("*")
    .eq("sector", workspace.sector);
  const { data: stmtData, error: stmtError } = await supabase
    .from("sentinel_statements")
    .select("*")
    .in(
      "workspace_id",
      ((allWsData ?? []) as Workspace[]).map((w) => w.id)
    );
  if (allWsError || stmtError) {
    return NextResponse.json({ error: (allWsError ?? stmtError)!.message }, { status: 500 });
  }
  const sectorWorkspaces = (allWsData ?? []) as Workspace[];
  const statements = (stmtData ?? []) as FinancialStatement[];

  const peerRows = buildPeerTable(sectorWorkspaces, statements, workspace_id, "FY");
  const allFlags = runAllChecks(peerRows, workspace.sector);
  const flags: AnomalyFlag[] = allFlags.filter(
    (f) => f.workspace_id === workspace_id && f.period_label === period_label
  );
  if (flags.length === 0) {
    return NextResponse.json({ error: "No flags for this workspace/period" }, { status: 404 });
  }

  const stmt = statements.find((s) => s.workspace_id === workspace_id && s.period_label === period_label);
  if (!stmt) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }
  const prior = findPriorYear(stmt, statements);
  const sectorCfg = getSectorConfig(workspace.sector);

  const systemPrompt =
    `You are a financial analyst covering the ${sectorCfg.display_name} sector.\n\n` +
    `${sectorCfg.narrative_context}\n\n` +
    "Be concrete and specific. Do not pad with generic caveats. If the data doesn't " +
    "support a confident conclusion, say what additional information would resolve it. " +
    "If multiple flags are given, consider whether they're connected before treating them " +
    "as separate stories.";

  const flagsBlock = flags.map((f) => `- ${f.description}`).join("\n");
  const plural = flags.length > 1 ? "flags were" : "flag was";

  const turn1User =
    `${flags.length} ${plural} raised for ${workspace.company_name} (${period_label}):\n${flagsBlock}\n\n` +
    `Company data:\n${companyContext(workspace, stmt, prior)}\n\n` +
    "Based only on this company's own data, what's your initial hypothesis for " +
    "why this happened? If there's more than one flag, say whether you think they're " +
    "connected or separate issues. 2-4 sentences.";

  try {
    const hypothesis = await callClaude(systemPrompt, [{ role: "user", content: turn1User }], 500);

    const metrics = flags.map((f) => f.metric);
    const peerContext = peerContextForMetrics(peerRows, metrics, workspace_id);
    const turn2User =
      `Here's how each flagged metric compares across the sector peer set for the same period:\n\n` +
      `${peerContext}\n\n` +
      "Does this peer context CONFIRM your hypothesis (a sector-wide effect), RULE IT OUT " +
      "(this looks company-specific), or point to something else? Start your reply with " +
      "exactly one short bolded verdict line using markdown (e.g. **Confirms sector-wide " +
      "effect**, **Rules out sector-wide effect**, or **Points to something else**), then a " +
      "blank line, then your final analyst narrative in 3-5 sentences covering all the flags " +
      "together.";

    const turn2Messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: turn1User },
      { role: "assistant", content: hypothesis },
      { role: "user", content: turn2User },
    ];
    const finalNarrative = await callClaude(systemPrompt, turn2Messages, 700);

    const followUps = await getSuggestedFollowUps(systemPrompt, [
      ...turn2Messages,
      { role: "assistant", content: finalNarrative },
    ]);

    const confidence = computeConfidence(flags, peerRows.length);

    const { error: upsertError } = await supabase.from("sentinel_investigations").upsert(
      {
        workspace_id,
        owner_id: userId,
        period_label,
        status: "pending",
        observation: flags,
        initial_hypothesis: hypothesis,
        ai_narrative: finalNarrative,
        confidence_score: confidence.score,
        confidence_signals: confidence.signals,
        suggested_questions: followUps.questions,
        suggested_actions: followUps.actions,
        final_narrative: null,
        reviewer_notes: null,
        archived_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,owner_id,period_label" }
    );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ status: "drafted" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 502 });
  }
}
