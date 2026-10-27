// Sentinel - statement save endpoint (the Data Entry page's API, and the
// one place server-side that writes statements). Handles two cases in one
// call: (1) workspace_id given -> add or update a statement on a company
// the caller OWNS; (2) no workspace_id, company_name + sector given ->
// create a new company owned by the caller, then write its first
// statement.
//
// This route uses the service-role key, which bypasses row-level security,
// so it enforces the rules itself: the caller must own the company they
// write to (a public reference company is read-only), only known statement
// columns are written, and the statement is validated before anything is
// created - a refused statement never leaves an empty company behind.

import { NextResponse } from "next/server";
import { getSectorConfig } from "../../../sentinel/lib/config";
import { BASES, withoutUnsetOptionalColumns } from "../../../sentinel/lib/fields";
import { diffStatement, readSources, recordChange, recordSources } from "../../../sentinel/lib/audit";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor } from "../../../sentinel/lib/server";
import { normaliseUnit } from "../../../sentinel/lib/units";
import { coerceStatement, validateStatement, type OtherStatement } from "../../../sentinel/lib/validate";
import type { Workspace } from "../../../sentinel/lib/types";

const fail = (error: string, status: number, details?: string[]) =>
  NextResponse.json(details ? { error, details } : { error }, { status });

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const { admin } = a;
  const who = await authenticate(req, admin);
  if (isFailure(who)) return who.error;
  const userId = who.userId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("The request body is not valid JSON.", 400);
  }
  if (!body || typeof body !== "object") return fail("Missing statement payload.", 400);

  const { row, errors: shapeErrors } = coerceStatement(body.statement);
  if (!row) {
    return fail(shapeErrors.length === 1 ? shapeErrors[0] : `${shapeErrors.length} problems with the statement`, 400, shapeErrors);
  }

  // Resolve the company: an existing one the caller owns, or a new one described by the request.
  let workspace: Workspace | null = null;
  let newCompany: Record<string, unknown> | null = null;
  if (body.workspace_id) {
    const loaded = await loadWorkspaceFor(admin, userId, body.workspace_id, "write");
    if (isFailure(loaded)) return loaded.error;
    workspace = loaded.workspace;
  } else {
    const name = typeof body.company_name === "string" ? body.company_name.trim() : "";
    const sector = typeof body.sector === "string" ? body.sector : "";
    if (!name || !sector) return fail("Provide workspace_id, or company_name + sector to create a new workspace.", 400);
    if (name.length > 120) return fail("company_name is too long (maximum 120 characters).", 400);
    try {
      getSectorConfig(sector); // throws if the sector is not configured
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Invalid sector.", 400);
    }
    const basis = body.comparison_basis ?? "consolidated";
    if (!(BASES as readonly unknown[]).includes(basis)) return fail('comparison_basis must be "standalone" or "consolidated".', 400);
    const fyStart = body.fiscal_year_start_month ?? 4;
    if (!Number.isInteger(fyStart) || (fyStart as number) < 1 || (fyStart as number) > 12) {
      return fail("fiscal_year_start_month must be a month number from 1 to 12.", 400);
    }
    const unit = body.currency_unit == null ? "INR_CRORE" : normaliseUnit(String(body.currency_unit));
    if (!unit) return fail("currency_unit is not a recognised reporting unit (crore, lakh, million, thousand, billion or plain rupees).", 400);
    const industry = typeof body.industry === "string" ? body.industry.trim().slice(0, 80) : "";
    newCompany = {
      owner_id: userId,
      company_name: name,
      sector,
      industry: industry || null,
      is_public_reference: false,
      fiscal_year_start_month: fyStart,
      currency: "INR",
      currency_unit: unit,
      comparison_basis: basis,
    };
  }

  // What is already on file for this company (nothing, for a company about to be created).
  let existingId: string | null = null;
  let existingRow: Record<string, unknown> | null = null;
  let others: OtherStatement[] = [];
  if (workspace) {
    const { data, error } = await admin
      .from("sentinel_statements")
      .select("*")
      .eq("workspace_id", workspace.id);
    if (error) return fail(error.message, 500);
    const all = data ?? [];
    // The database's unique key is (company, label, basis), so that is what identifies "the same
    // statement". A different period type under the same label would be a different statement.
    const same = all.find((s) => s.period_label === row.period_label && s.basis === row.basis);
    if (same && same.period_type !== row.period_type) {
      return fail(
        `A ${row.basis} statement labelled "${row.period_label}" already exists as ${same.period_type}. ` +
          `Use a different label, or edit that statement.`,
        409
      );
    }
    existingId = same?.id ?? null;
    existingRow = same ?? null;
    others = all.filter((s) => s.id !== existingId);
  }

  const { errors, warnings } = validateStatement(row, others);
  if (errors.length > 0) {
    return fail(errors.length === 1 ? errors[0] : `${errors.length} data quality issues found`, 422, errors);
  }

  // Everything is valid: create the company now, if there is one to create.
  let createdWorkspaceId: string | null = null;
  if (!workspace) {
    const { data, error } = await admin.from("sentinel_workspaces").insert(newCompany!).select().single();
    if (error || !data) return fail(error?.message ?? "Workspace creation failed.", 500);
    workspace = data as Workspace;
    createdWorkspaceId = workspace.id;
  }

  const record = withoutUnsetOptionalColumns({ ...row, workspace_id: workspace.id }, existingRow);
  if (existingId) {
    const { error } = await admin.from("sentinel_statements").update(record).eq("id", existingId);
    if (error) return fail(error.message, 500);
    const history = await recordChange(admin, {
      workspaceId: workspace.id, statementId: existingId, periodLabel: row.period_label, basis: row.basis, action: "updated", userId,
      changes: existingRow ? diffStatement(existingRow, record) : {},
    });
    await recordSources(admin, workspace.id, existingId, readSources(body.sources, record));
    return NextResponse.json({ status: "updated", workspace_id: workspace.id, statement_id: existingId, warnings, history_recorded: history });
  }

  const { data: inserted, error: insertError } = await admin.from("sentinel_statements").insert(record).select("id").single();
  if (insertError || !inserted) {
    // Do not leave an empty company behind because its first statement could not be saved.
    if (createdWorkspaceId) await admin.from("sentinel_workspaces").delete().eq("id", createdWorkspaceId);
    const duplicate = insertError?.code === "23505";
    return fail(
      duplicate
        ? `A ${row.basis} statement labelled "${row.period_label}" already exists for this company.`
        : insertError?.message ?? "Could not save the statement.",
      duplicate ? 409 : 500
    );
  }
  const history = await recordChange(admin, {
    workspaceId: workspace.id, statementId: inserted.id, periodLabel: row.period_label, basis: row.basis, action: "created", userId, changes: {},
  });
  await recordSources(admin, workspace.id, inserted.id, readSources(body.sources, record));
  return NextResponse.json({ status: "created", workspace_id: workspace.id, statement_id: inserted.id, warnings, history_recorded: history });
}
