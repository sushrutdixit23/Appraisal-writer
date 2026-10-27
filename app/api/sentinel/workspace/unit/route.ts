// Sentinel - change the unit a project reports in. Owner only (a reference company is read-only).
//
//   mode "relabel"  the figures stay as stored; only the unit label changes (they were entered in lakh under a crore label)
//   mode "convert"  every amount on every period is multiplied by the factor between the two units
//
// Statements are rewritten in ONE request (a single upsert is a single transaction in PostgREST), then the project's
// unit is changed. If that second step fails the original rows are written back, so a half-converted project is not
// left behind; if even that fails the response says so plainly. Narratives already written for the project quote
// amounts in the old unit; the response counts them so the page can tell the person to regenerate.

import { NextResponse } from "next/server";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor } from "../../../../sentinel/lib/server";
import { planUnitChange } from "../../../../sentinel/lib/unitChange";
import type { FinancialStatement } from "../../../../sentinel/lib/types";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const { admin } = a;
  const who = await authenticate(req, admin);
  if (isFailure(who)) return who.error;

  let body: { workspace_id?: unknown; unit?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("The request body is not valid JSON.", 400);
  }
  if (!body || typeof body !== "object") return fail("The request body is not valid JSON.", 400);

  const loaded = await loadWorkspaceFor(admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  const { workspace } = loaded;

  const { data, error: readError } = await admin.from("sentinel_statements").select("*").eq("workspace_id", workspace.id);
  if (readError) return fail(readError.message, 500);
  const statements = (data ?? []) as FinancialStatement[];

  const plan = planUnitChange(statements, workspace.currency_unit, body.unit, body.mode);
  if (!plan.ok) return fail(plan.error, 400);

  const originals = statements.filter((s) => plan.rows.some((r) => r.id === s.id));
  if (plan.rows.length > 0) {
    const { error } = await admin.from("sentinel_statements").upsert(plan.rows, { onConflict: "id" });
    if (error) return fail(`Nothing was changed: ${error.message}`, 500);
  }

  const { error: unitError } = await admin.from("sentinel_workspaces").update({ currency_unit: plan.to }).eq("id", workspace.id);
  if (unitError) {
    if (originals.length > 0) {
      const { error: revertError } = await admin.from("sentinel_statements").upsert(originals, { onConflict: "id" });
      if (revertError) {
        return fail(
          `The unit could not be changed (${unitError.message}) and the figures could not be restored (${revertError.message}). ` +
            `Do not convert again: check this project's periods before using it.`,
          500
        );
      }
    }
    return fail(`Nothing was changed: ${unitError.message}`, 500);
  }

  // Best effort: a failure to count does not undo a change that succeeded.
  const { data: narratives } = await admin.from("sentinel_investigations").select("id, ai_narrative, final_narrative").eq("workspace_id", workspace.id);
  const count = (narratives ?? []).filter((n) => n.ai_narrative || n.final_narrative).length;

  return NextResponse.json({
    status: "changed",
    mode: plan.mode,
    from: plan.from,
    to: plan.to,
    statements_changed: plan.statementsChanged,
    lossy: plan.lossy,
    investigations_to_regenerate: count,
  });
}
