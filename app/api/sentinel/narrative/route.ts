// Sentinel — investigation generation. Rebuilt around workspace_id and
// the full chain: Observation (flags, already computed) -> AI Analysis
// (two-turn hypothesis+peer-check, unchanged from Phase 1) -> Suggested
// Questions/Actions (new — a third, tightly-scoped call) -> Confidence
// (computed deterministically via computeConfidence, NEVER asked of
// Claude — see anomaly.ts). Writes to sentinel_investigations, not the
// old sentinel_reviews table.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { normaliseUsage, summariseUsage, type TurnUsage } from "../../../sentinel/lib/aiUsage";
import { computeConfidence, runAllChecks } from "../../../sentinel/lib/anomaly";
import { buildPeerTable, findPriorYear } from "../../../sentinel/lib/engine";
import { getSectorConfig } from "../../../sentinel/lib/config";
import { findClosestPeer } from "../../../sentinel/lib/benchmark";
import { basisNote, formatMetricValue, materialityNote, receivablesDefinitionNote, receivablesStandingCaveat, trendBlock } from "../../../sentinel/lib/narrativeContext";
import { parseChecks } from "../../../sentinel/lib/autofill/annualChecks";
import { NOTE_LABEL, parseNotes } from "../../../sentinel/lib/autofill/notes";
import { checkNarrativeGrounding } from "../../../sentinel/lib/narrativeGrounding";
import { DECIDED_STATUSES, renderDecisionMemory, type PriorInvestigation } from "../../../sentinel/lib/decisionMemory";
import { renderSectorPatterns, sectorPatterns } from "../../../sentinel/lib/sectorPatterns";
import { authenticate, rateLimit, getAdmin, isFailure, loadPeerContext, loadWorkspaceFor } from "../../../sentinel/lib/server";
import { operatingContext, type MetricRow } from "../../../sentinel/lib/metrics";
import { formatMoney } from "../../../sentinel/lib/units";
import type {
  AnomalyFlag,
  FinancialStatement,
  PeerRow,
  Workspace,
} from "../../../sentinel/lib/types";

const MODEL = "claude-sonnet-5";
// The third turn only reformats an analysis that already exists into JSON (questions + structured
// recommendations) - the cheapest model is enough, at a twentieth of the price per token. If it
// ever fails, the same turn is retried once on MODEL, so a model-availability problem degrades
// cost, not the feature.
const FOLLOW_UP_MODEL = "claude-haiku-5-5";

const inr = (v: number) =>
  `\u20b9${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;

// The statement's own figures are in the company's reporting unit (lakh, million, crore...), so
// they are labelled with that unit. Peer figures are already converted to crore by buildPeerTable.
function companyContext(
  ws: Workspace,
  stmt: FinancialStatement,
  prior: FinancialStatement | null
): string {
  const money = (v: number) => formatMoney(v, ws.currency_unit);
  const lines = [
    `${ws.company_name} (${stmt.period_label}, ${stmt.basis}):`,
    `  Revenue: ${money(stmt.revenue_from_operations)}`,
    `  PAT: ${money(stmt.profit_after_tax)}`,
    `  PBT: ${money(stmt.profit_before_tax)}`,
  ];
  if (stmt.exceptional_items) {
    lines.push(
      `  Exceptional items: ${money(stmt.exceptional_items)} (${stmt.exceptional_items < 0 ? "a gain" : "a loss/expense"})`
    );
  }
  if (prior) {
    lines.push(
      `  Prior year (${prior.period_label}): Revenue ${money(prior.revenue_from_operations)}, ` +
        `PAT ${money(prior.profit_after_tax)}`
    );
  }
  return lines.join("\n");
}

// Cut further than the already-truncated stored text (extractKeyAuditMattersText caps at 4000):
// this is one block inside a prompt that also carries peer context and follow-up turns, and the
// auditor's own wording rarely needs more than this to be useful as a lead, not a full re-read.
const KAM_PROMPT_CHARS = 1500;

/** The auditor's own words, if captured for this statement (see extraction.ts
 * extractKeyAuditMattersText) - real red flags often show up in this prose before they ever
 * become a number the ratio checks can catch. Null when nothing was captured (an older
 * statement, a filing with no machine-readable Key Audit Matters section, or a manually entered
 * row), so the prompt says nothing about it rather than describing an absence. */
function keyAuditMattersBlock(stmt: FinancialStatement): string {
  const text = stmt.key_audit_matters_text;
  if (!text) return "";
  const cut = text.length > KAM_PROMPT_CHARS ? `${text.slice(0, KAM_PROMPT_CHARS).trim()}...` : text;
  return (
    `\n\nThe auditor's own Key Audit Matters for this filing (verbatim, from the annual report):\n"""\n${cut}\n"""\n` +
    "Use this only where it actually bears on the flag(s) above - a Key Audit Matter naming the " +
    "same account or process as a flag is worth citing by name; one about an unrelated area is " +
    "not worth forcing in."
  );
}

/** What the auditor's report raised, when it raised anything: a qualification, an emphasis of matter, a going-concern uncertainty. Silent for a clean report, so the
 * prompt does not describe an absence. Verbatim, because it is the auditor's wording, not ours. */
function annualChecksBlock(stmt: FinancialStatement): string {
  const c = parseChecks(stmt.annual_report_checks);
  if (!c) return "";
  const notable = c.findings.filter((f) => f.severity !== "info");
  if (notable.length === 0) return "";
  const lines = notable.slice(0, 3).map((f) => `- ${f.title}: "${f.detail.length > 600 ? `${f.detail.slice(0, 600).trim()}...` : f.detail}"`);
  return (
    `\n\nWhat the auditor's report raises for this filing (the auditor's own words, from the annual report):\n${lines.join("\n")}\n` +
    "A qualification or a going-concern uncertainty is serious: if it bears on a flag above, say so plainly; if it does not, do not force a link."
  );
}

/** What the notes to the annual report raise at high or medium severity, each with its page: a CARO answer that is not the clean one, a long receivables tail,
 * borrowings falling due within a year. Silent when there is none. The model is told to treat these as leads from the filing, not as conclusions of its own. */
function annualNotesBlock(stmt: FinancialStatement): string {
  const n = parseNotes(stmt.annual_report_notes);
  const notable = n?.findings.filter((f) => f.severity !== "info").slice(0, 5) ?? [];
  if (notable.length === 0) return "";
  const lines = notable.map((f) => `- ${f.title} (${NOTE_LABEL[f.note].toLowerCase()}, p.${f.page}): ${f.detail.length > 360 ? `${f.detail.slice(0, 360).trim()}...` : f.detail}`);
  return (
    `\n\nWhat the notes to the annual report raise for this filing (read by rules from the filing itself, each with its page):\n${lines.join("\n")}\n` +
    "Use these only where they bear on a flag above, and cite the page. Do not state a figure that is not in the lines above or the company data."
  );
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
    // A flag on a figure with no peer ratio (negative equity) has nothing to compare against.
    if (!rows.some((r) => r.ratios[metric] != null)) continue;
    const lines = rows
      .filter((r) => r.ratios[metric] != null)
      .sort((a, b) => (b.ratios[metric] ?? 0) - (a.ratios[metric] ?? 0))
      .map((r) => {
        const marker = r.workspace_id === flaggedWorkspaceId ? " <- flagged company" : "";
        return `  ${r.company_name} (${r.basis}): ${formatMetricValue(metric, r.ratios[metric] as number)}${marker}`;
      });
    sections.push(`${metric}:\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

type Turn = { role: "user" | "assistant"; content: string };

// Investigation columns added after the first release; each has a hand-run migration, so a database
// without one must still be able to save an investigation.
const OPTIONAL_INVESTIGATION_COLUMNS = ["grounding_warnings", "generation_usage"] as const;
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST204" || /could not find the .* column|column .* does not exist/i.test(e.message ?? ""));

/** One model call, with its token usage recorded on `meter` under `label`. Uses the official SDK
 * (which also retries 429/5xx for us); ANTHROPIC_BASE_URL is honoured by the SDK itself. */
async function callClaude(
  system: string,
  messages: Turn[],
  maxTokens: number,
  meter: TurnUsage[],
  label: string,
  model: string = MODEL
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({ model, max_tokens: maxTokens, thinking: { type: "disabled" }, system, messages });
  meter.push({ turn: label, model, ...normaliseUsage(res.usage) });
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text block in Anthropic response");
  return textBlock.text;
}

type RecommendationDraft = {
  title: string;
  priority: "High" | "Medium" | "Low";
  business_value: string;
  financial_impact: string | null;
  owner: string;
  timeline: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

/** Turn 3: suggested questions + structured recommendations, as strict
 * JSON. Failure here is non-fatal - an investigation without these is
 * still a complete, approvable finding; it just falls back to empty
 * lists rather than failing the whole generation over a secondary
 * enrichment step. Recommendations are validated field-by-field before
 * being trusted - a malformed entry from the model is dropped rather
 * than saved with a missing priority or difficulty. */
async function getSuggestedFollowUps(
  system: string,
  priorMessages: Turn[],
  meter: TurnUsage[]
): Promise<{ questions: string[]; recommendations: RecommendationDraft[] }> {
  const prompt =
    "Based on your analysis above, list 2-4 specific follow-up questions an analyst " +
    "should ask to verify or refine this finding, and 2-4 concrete recommendations. For each " +
    "recommendation, provide: title (short, a few words), priority (exactly \"High\", \"Medium\", " +
    "or \"Low\"), business_value (1-2 sentences on why this matters), financial_impact (optional, " +
    "a rupee or percentage estimate with the calculation shown inline, or omit if not derivable " +
    "from the data given), owner (a plausible owner role, e.g. \"Finance Head\"), timeline (a " +
    "realistic window, e.g. \"0-2 weeks\"), and difficulty (exactly \"Easy\", \"Medium\", or \"Hard\"). " +
    "Respond with ONLY this JSON shape, no other text: " +
    '{"questions": ["...", "..."], "recommendations": [{"title": "...", "priority": "...", ' +
    '"business_value": "...", "financial_impact": "..." , "owner": "...", "timeline": "...", ' +
    '"difficulty": "..."}]}';
  try {
    const turns: Turn[] = [...priorMessages, { role: "user", content: prompt }];
    let raw: string;
    try {
      raw = await callClaude(system, turns, 600, meter, "follow_ups", FOLLOW_UP_MODEL);
    } catch {
      raw = await callClaude(system, turns, 600, meter, "follow_ups_retry", MODEL);
    }
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((q: unknown) => typeof q === "string")
      : [];
    const validPriorities = new Set(["High", "Medium", "Low"]);
    const validDifficulties = new Set(["Easy", "Medium", "Hard"]);
    const recommendations: RecommendationDraft[] = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
          .filter(
            (r: unknown): r is Record<string, unknown> =>
              typeof r === "object" &&
              r !== null &&
              typeof (r as Record<string, unknown>).title === "string" &&
              validPriorities.has((r as Record<string, unknown>).priority as string) &&
              typeof (r as Record<string, unknown>).business_value === "string" &&
              typeof (r as Record<string, unknown>).owner === "string" &&
              typeof (r as Record<string, unknown>).timeline === "string" &&
              validDifficulties.has((r as Record<string, unknown>).difficulty as string)
          )
          .map((r: Record<string, unknown>) => ({
            title: r.title as string,
            priority: r.priority as "High" | "Medium" | "Low",
            business_value: r.business_value as string,
            financial_impact: typeof r.financial_impact === "string" ? r.financial_impact : null,
            owner: r.owner as string,
            timeline: r.timeline as string,
            difficulty: r.difficulty as "Easy" | "Medium" | "Hard",
          }))
      : [];
    return { questions, recommendations };
  } catch {
    return { questions: [], recommendations: [] };
  }
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const { admin: supabase } = a;
  const who = await authenticate(req, supabase);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "narrative", 20, 10 * 60_000);
  if (limited) return limited.error;
  const userId = who.userId;

  let body: { workspace_id?: unknown; period_label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }
  const { workspace_id, period_label } = body;
  if (!workspace_id || typeof period_label !== "string" || !period_label) {
    return NextResponse.json({ error: "Missing workspace_id or period_label" }, { status: 400 });
  }

  // The caller may only generate for a company they can see, and the peer set around it is limited
  // to companies they can see too (reference companies and their own) - the same set the pages show.
  const loaded = await loadWorkspaceFor(supabase, userId, workspace_id, "read");
  if (isFailure(loaded)) return loaded.error;
  const workspace = loaded.workspace;
  const context = await loadPeerContext(supabase, userId, workspace);
  if (isFailure(context)) return context.error;
  const sectorWorkspaces = context.workspaces;
  const statements = context.statements;

  const peerRows = buildPeerTable(sectorWorkspaces, statements, workspace.id, "FY");
  const allFlags = runAllChecks(peerRows, workspace.sector);
  const flags: AnomalyFlag[] = allFlags.filter(
    (f) => f.workspace_id === workspace.id && f.period_label === period_label
  );
  if (flags.length === 0) {
    return NextResponse.json({ error: "No flags for this workspace/period" }, { status: 404 });
  }

  // The statement the flags were computed from: the annual one on the basis the peer table used.
  const selfRow = peerRows.find((r) => r.workspace_id === workspace.id);
  const stmt = statements.find(
    (s) =>
      s.workspace_id === workspace.id &&
      s.period_type === "FY" &&
      s.period_label === period_label &&
      s.basis === selfRow?.basis
  );
  if (!stmt) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }
  const prior = findPriorYear(stmt, statements);
  // Operating measures the person recorded (best effort: the table may not exist yet). Anything not listed is
  // told to the model as unknown, so it does not invent an attrition or utilisation story.
  const { data: opRows } = await supabase.from("sentinel_operating_metrics").select("period_label,metric,value,unit,source").eq("workspace_id", workspace.id);
  const operating = operatingContext((opRows ?? []) as MetricRow[]);
  const sectorCfg = getSectorConfig(workspace.sector);

  const systemPrompt =
    `You are a financial analyst covering the ${sectorCfg.display_name} sector.\n\n` +
    `${sectorCfg.narrative_context}\n\n` +
    "Be concrete and specific. Do not pad with generic caveats. If the data doesn't " +
    "support a confident conclusion, say what additional information would resolve it. " +
    "If multiple flags are given, consider whether they're connected before treating them " +
    "as separate stories. When you state a rupee or percentage impact, show the calculation " +
    "inline using the actual numbers given to you, in the form \"input \u00d7 input = result\" " +
    "(e.g. \"Revenue \u20b922.7cr \u00d7 (15% - 7.9%) = \u20b91.6cr\") rather than stating the number " +
    "alone - never state a figure you can't derive from the data you were given.";

  const flagsBlock = flags.map((f) => `- ${f.description}`).join("\n");
  const plural = flags.length > 1 ? "flags were" : "flag was";

  // What this reviewer already decided about this company in earlier periods (best effort: a failed read
  // just means no memory, never a failed generation).
  const { data: priorRows } = await supabase
    .from("sentinel_investigations")
    .select("period_label,status,observation,reviewer_notes,final_narrative,updated_at")
    .eq("workspace_id", workspace.id)
    .eq("owner_id", userId)
    .in("status", [...DECIDED_STATUSES])
    .neq("period_label", period_label)
    .order("updated_at", { ascending: false })
    .limit(8);
  const memory = renderDecisionMemory((priorRows ?? []) as PriorInvestigation[], flags);

  // Whether each flag is a sector story or a company story, counted from the flags themselves.
  const patterns = sectorPatterns(allFlags, peerRows, workspace.id, period_label);
  const patternBlock = renderSectorPatterns(patterns, period_label);

  const trend = trendBlock(stmt, prior, prior ? findPriorYear(prior, statements) : null, workspace.sector, flags.map((f) => f.metric));

  const turn1User =
    `${flags.length} ${plural} raised for ${workspace.company_name} (${period_label}):\n${flagsBlock}\n\n` +
    `Company data:\n${companyContext(workspace, stmt, prior)}${trend}${operating}${keyAuditMattersBlock(stmt)}${annualChecksBlock(stmt)}${annualNotesBlock(stmt)}${memory}\n\n` +
    "Based only on this company's own data, what's your initial hypothesis for " +
    "why this happened? If there's more than one flag, say whether you think they're " +
    "connected or separate issues. 2-4 sentences.";

  const meter: TurnUsage[] = [];
  try {
    const hypothesis = await callClaude(systemPrompt, [{ role: "user", content: turn1User }], 500, meter, "hypothesis");

    const metrics = flags.map((f) => f.metric);
    const peerContext = peerContextForMetrics(peerRows, metrics, workspace.id);
    const closestPeer = findClosestPeer(peerRows, workspace.id);
    const closestPeerBlock = closestPeer
      ? `\n\nClosest comparable peer by revenue scale: ${closestPeer.company_name} ` +
        `(revenue ${inr(closestPeer.revenue_cr)}). Where it sharpens the analysis, compare the ` +
        `subject directly against this named company rather than only citing a sector-wide ` +
        `average - a well-matched named peer is a stronger benchmark than a broad average.`
      : "";
    const receivablesInPlay = flags.some((f) => f.metric === "receivable_days" || f.metric === "cash_conversion_cycle");
    const caveats = [
      basisNote(peerRows),
      // Specific evidence when some peers carry an unbilled line and others do not; otherwise the standing caveat, because the
      // definition is unrecorded for most companies and a model left to itself will call a definition gap a collections finding.
      receivablesInPlay ? receivablesDefinitionNote(peerRows) ?? receivablesStandingCaveat() : null,
      flags.some((f) => f.flag_type === "working_capital") ? materialityNote(workspace.sector) : null,
    ]
      .filter((c): c is string => !!c)
      .map((c) => `\n\nData caveat: ${c}`)
      .join("");
    const turn2User =
      `Here's how each flagged metric compares across the sector peer set for the same period:\n\n` +
      `${peerContext}${caveats}${closestPeerBlock}${patternBlock}\n\n` +
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
    const finalNarrative = await callClaude(systemPrompt, turn2Messages, 700, meter, "narrative");

    const followUps = await getSuggestedFollowUps(
      systemPrompt,
      [...turn2Messages, { role: "assistant", content: finalNarrative }],
      meter
    );
    const usage = summariseUsage(meter);

    const confidence = computeConfidence(flags, peerRows.length);

    // Does every rupee/% figure the model stated actually trace to the data it was given? Checked
    // in code, after the fact - never asked of the model itself. The hypothesis only ever saw
    // turn1User; the final narrative also saw the peer context from turn2User.
    const groundingWarnings = [
      ...checkNarrativeGrounding(hypothesis, turn1User).map((f) => `Initial hypothesis cites ${f}, not traceable to the company data given.`),
      ...checkNarrativeGrounding(finalNarrative, `${turn1User}\n\n${turn2User}`).map(
        (f) => `Final narrative cites ${f}, not traceable to the company or peer data given.`
      ),
    ];

    const row: Record<string, unknown> = {
      workspace_id: workspace.id,
      // Inherits whatever review cycle the underlying statement is
      // already attached to (set via Add Period's "Review cycle"
      // picker) - no new request parameter or caller change needed.
      // A statement with no review cycle attached simply produces an
      // unattached investigation, same as before this change.
      review_cycle_id: stmt.review_cycle_id ?? null,
      owner_id: userId,
      period_label,
      status: "pending",
      observation: flags,
      initial_hypothesis: hypothesis,
      ai_narrative: finalNarrative,
      confidence_score: confidence.score,
      confidence_signals: confidence.signals,
      grounding_warnings: groundingWarnings,
      generation_usage: usage,
      suggested_questions: followUps.questions,
      // Recommendation Engine (Phase B): the old formatted-string
      // actions column stops being written going forward - real
      // recommendations now live in sentinel_recommendations
      // instead. Existing investigations keep whatever they already
      // have in this column; this only affects new/regenerated ones.
      suggested_actions: [],
      final_narrative: null,
      reviewer_notes: null,
      archived_at: null,
      updated_at: new Date().toISOString(),
    };
    const save = (r: Record<string, unknown>) =>
      supabase.from("sentinel_investigations").upsert(r, { onConflict: "workspace_id,owner_id,period_label" }).select("id").single();
    let { data: upsertData, error: upsertError } = await save(row);
    // The columns added after the first release may not exist yet (their migrations are run by hand): save the
    // investigation without them rather than fail the whole generation over bookkeeping.
    if (isMissingColumn(upsertError)) {
      const slim = { ...row };
      for (const k of OPTIONAL_INVESTIGATION_COLUMNS) delete slim[k];
      ({ data: upsertData, error: upsertError } = await save(slim));
    }
    if (upsertError || !upsertData) {
      return NextResponse.json({ error: upsertError?.message ?? "Could not save the investigation." }, { status: 500 });
    }

    // Recommendations are regenerated in full alongside the
    // investigation - same "regenerate replaces" semantics as the
    // investigation upsert itself. Safe for now because no approval
    // workflow exists yet (Phase C); once recommendations can be
    // individually approved, this delete-then-insert should be
    // revisited so regenerating a draft does not erase already-
    // reviewed recommendations.
    const investigationId = upsertData.id as string;
    const { error: deleteRecError } = await supabase
      .from("sentinel_recommendations")
      .delete()
      .eq("investigation_id", investigationId);
    if (deleteRecError) {
      console.error("Sentinel recommendations delete error:", deleteRecError);
    } else if (followUps.recommendations.length > 0) {
      const evidenceText = flags.map((f) => f.description).join(" | ");
      const { error: insertRecError } = await supabase.from("sentinel_recommendations").insert(
        followUps.recommendations.map((rec) => ({
          workspace_id: workspace.id,
          investigation_id: investigationId,
          review_cycle_id: stmt.review_cycle_id ?? null,
          owner_id: userId,
          title: rec.title,
          priority: rec.priority,
          business_value: rec.business_value,
          financial_impact: rec.financial_impact,
          owner: rec.owner,
          timeline: rec.timeline,
          difficulty: rec.difficulty,
          confidence_score: confidence.score,
          evidence: evidenceText,
          status: "pending",
        }))
      );
      if (insertRecError) {
        // Non-fatal, same convention as the old suggested-actions call -
        // the investigation itself is already saved successfully above.
        console.error("Sentinel recommendations insert error:", insertRecError);
      }
    }

    console.info(
      `Sentinel narrative ${workspace.id} ${period_label}: ${usage.total.input_tokens} in / ${usage.total.output_tokens} out tokens, ` +
        `${usage.total.cache_read_input_tokens} cached, est. $${usage.estimated_cost_usd ?? "?"}`
    );
    return NextResponse.json({ status: "drafted", usage });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 502 });
  }
}
