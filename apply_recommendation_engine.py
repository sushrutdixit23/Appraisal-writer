# -*- coding: utf-8 -*-
"""
Sentinel - Recommendation Engine Phase B: structured recommendation
generation. Replaces the turn-3 "suggested actions" string list with
real rows in sentinel_recommendations. Only touches
app/api/sentinel/narrative/route.ts. Run from the repo root.
"""
import io
import os
import sys

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_check(path, content):
    opens = content.count("{")
    closes = content.count("}")
    if opens == closes:
        print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
    else:
        print("[MISS] brace mismatch in " + path + ": " + str(opens) + " open / " + str(closes) + " close")

def apply_edit(content, old, new, label, get_content_path):
    count = content.count(old)
    if count == 0:
        print("[MISS] " + label + ": anchor not found. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    if count > 1:
        print("[MISS] " + label + ": anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    print("[OK] " + label)
    return content.replace(old, new, 1)

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

page_path = os.path.join(ROOT, "app", "api", "sentinel", "narrative", "route.ts")
current = read(page_path)
get_content_cmd = page_path

# Edit 1: replace getSuggestedFollowUps entirely with a structured
# version. Anchored starting at the function signature (not the
# docstring above it, which has a pre-existing mojibake character from
# an earlier paste) so this edit does not depend on matching that byte
# sequence exactly.
edit1_old = '''/** Turn 3: suggested questions + actions, as strict JSON. Failure here is
 * non-fatal — an investigation without these is still a complete,
 * approvable finding; it just falls back to empty lists rather than
 * failing the whole generation over a secondary enrichment step. Actions
 * carry an "Owner · Timeline: text" prefix (matching the GDT/TSR advisory
 * format) baked directly into the string, so no schema or rendering
 * change is needed anywhere else in the app. */
async function getSuggestedFollowUps(
  system: string,
  priorMessages: { role: "user" | "assistant"; content: string }[]
): Promise<{ questions: string[]; actions: string[] }> {
  const prompt =
    "Based on your analysis above, list 2-4 specific follow-up questions an analyst " +
    "should ask to verify or refine this finding, and 2-4 concrete next actions. For each " +
    "action, prefix it with a plausible owner role and a realistic timeline in this exact " +
    'format: "Owner \\u00b7 Timeline: action text" (e.g. "Finance Head \\u00b7 0-2 weeks: Commission ' +
    'a physical stock count of closing inventory"). ' +
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
}'''

edit1_new = r'''type RecommendationDraft = {
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
  priorMessages: { role: "user" | "assistant"; content: string }[]
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
    '{"questions": ["...",""..."], "recommendations": [{"title": "...", "priority": "...", ' +
    '"business_value": "...", "financial_impact": "..." , "owner": "...", "timeline": "...", ' +
    '"difficulty": "..."}]}';
  try {
    const raw = await callClaude(system, [...priorMessages, { role: "user", content: prompt }], 600);
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
}'''

current2 = apply_edit(current, edit1_old, edit1_new, "replace getSuggestedFollowUps with structured recommendations", get_content_cmd)

# Edit 2: capture the investigation's id from the upsert, stop writing
# suggested_actions, and generate+save real recommendation rows.
edit2_old = '''    const confidence = computeConfidence(flags, peerRows.length);

    const { error: upsertError } = await supabase.from("sentinel_investigations").upsert(
      {
        workspace_id,
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

    return NextResponse.json({ status: "drafted" });'''

edit2_new = '''    const confidence = computeConfidence(flags, peerRows.length);

    const { data: upsertData, error: upsertError } = await supabase
      .from("sentinel_investigations")
      .upsert(
        {
          workspace_id,
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
        },
        { onConflict: "workspace_id,owner_id,period_label" }
      )
      .select("id")
      .single();
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
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
          workspace_id,
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

    return NextResponse.json({ status: "drafted" });'''

current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "capture investigation id and save recommendations", get_content_cmd)

if current3 is not None:
    write(page_path, current3)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current3)
else:
    print("[MISS] route.ts NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
