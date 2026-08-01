import pathlib

path = pathlib.Path("app/api/sentinel/statement/route.ts")
path.parent.mkdir(parents=True, exist_ok=True)

content = r'''// Sentinel — manual data entry endpoint. Built to unblock end-to-end
// testing with a real single-company workspace (Britannia) without
// depending on the existing New Project / Add Period forms, which
// don't yet collect Balance Sheet fields. Handles two cases in one
// call: (1) workspace_id given -> add/update a statement on an
// existing workspace; (2) no workspace_id, company_name+sector given
// -> create a new self-service workspace first (same owner_id pattern
// New Project already uses), then write the statement. Upserts by
// looking up an existing (workspace_id, period_type, period_label) row
// rather than relying on a guessed unique-constraint name for
// .upsert()/onConflict.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSectorConfig } from "../../../sentinel/lib/config";
import type { Workspace } from "../../../sentinel/lib/types";

// Phase 0 \u2014 Data Quality Layer. Runs after the workspace is resolved
// (so prior-period context is available) and before any write. Hard
// errors block the save entirely (422, nothing written); warnings are
// returned alongside a successful save so the UI can surface them
// without blocking data entry. Scoped to what this form actually
// collects today - cash flow ties and segment reconciliation are left
// out because those fields aren't captured yet, not because they don't
// matter.
interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function validateStatement(statement: any, priorStatements: any[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Balance sheet must balance, within a 1% tolerance for real-world
  // rounding in filed statements.
  const { total_assets, total_liabilities, total_equity } = statement;
  if (total_assets != null && total_liabilities != null && total_equity != null) {
    const impliedTotal = total_liabilities + total_equity;
    const diff = Math.abs(total_assets - impliedTotal);
    const tolerance = Math.max(Math.abs(total_assets) * 0.01, 1);
    if (diff > tolerance) {
      errors.push(
        `Balance sheet does not balance: Total Assets (${total_assets}) vs Total ` +
        `Liabilities + Total Equity (${impliedTotal.toFixed(2)}) \u2014 difference of ${diff.toFixed(2)}.`
      );
    }
  }

  // Fields that should never be negative for a going concern.
  const nonNegativeFields: [string, string][] = [
    ["current_assets", "Current assets"],
    ["current_liabilities", "Current liabilities"],
    ["inventory", "Inventory"],
    ["trade_receivables", "Trade receivables"],
    ["trade_payables", "Trade payables"],
    ["total_debt", "Total debt"],
    ["total_equity", "Total equity"],
    ["total_assets", "Total assets"],
    ["total_liabilities", "Total liabilities"],
    ["fixed_assets", "Fixed assets"],
    ["cash_and_equivalents", "Cash & equivalents"],
    ["revenue_from_operations", "Revenue from operations"],
  ];
  for (const [field, label] of nonNegativeFields) {
    const value = statement[field];
    if (value != null && value < 0) {
      errors.push(`${label} cannot be negative (got ${value}).`);
    }
  }

  // A subtotal cannot exceed its own total.
  if (statement.current_assets != null && statement.total_assets != null &&
      statement.current_assets > statement.total_assets) {
    errors.push(
      `Current assets (${statement.current_assets}) cannot exceed total assets (${statement.total_assets}).`
    );
  }
  if (statement.current_liabilities != null && statement.total_liabilities != null &&
      statement.current_liabilities > statement.total_liabilities) {
    errors.push(
      `Current liabilities (${statement.current_liabilities}) cannot exceed total liabilities (${statement.total_liabilities}).`
    );
  }

  // Total income should be revenue plus other income, so it should
  // never come in below revenue from operations alone.
  if (statement.total_income != null && statement.revenue_from_operations != null &&
      statement.total_income < statement.revenue_from_operations - 0.01) {
    warnings.push(
      `Total income (${statement.total_income}) is less than revenue from operations ` +
      `(${statement.revenue_from_operations}) \u2014 total income should normally include ` +
      `revenue plus other income. Double-check these two figures.`
    );
  }

  // Unit-mismatch heuristic: a >20x jump or drop in revenue vs. the
  // most recent period on file for this workspace is far more often a
  // lakhs/crores mix-up than a real business swing worth investigating.
  if (priorStatements.length > 0 && statement.revenue_from_operations != null) {
    const sorted = [...priorStatements].sort((a, b) =>
      (b.period_end_date ?? "").localeCompare(a.period_end_date ?? "")
    );
    const mostRecent = sorted[0];
    if (mostRecent?.revenue_from_operations != null && mostRecent.revenue_from_operations > 0) {
      const ratio = statement.revenue_from_operations / mostRecent.revenue_from_operations;
      if (ratio > 20 || ratio < 0.05) {
        const direction = ratio > 1 ? `${ratio.toFixed(1)}x higher` : `${(1 / ratio).toFixed(1)}x lower`;
        warnings.push(
          `Revenue from operations (${statement.revenue_from_operations}) is ${direction} than ` +
          `the most recent period on file (${mostRecent.period_label}: ${mostRecent.revenue_from_operations}). ` +
          `This is more often a units mismatch (e.g. lakhs vs. crores) than a real swing \u2014 double-check before saving.`
        );
      }
    }
  }

  // Same period end date filed twice under different labels.
  if (statement.period_end_date) {
    const dupe = priorStatements.find(
      (s) => s.period_end_date === statement.period_end_date && s.period_label !== statement.period_label
    );
    if (dupe) {
      warnings.push(
        `A statement already exists for this workspace with the same period end date ` +
        `(${statement.period_end_date}) but a different label ("${dupe.period_label}" vs ` +
        `"${statement.period_label}"). Check this isn't a duplicate entry.`
      );
    }
  }

  return { errors, warnings };
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

  const body = await req.json();
  const {
    workspace_id,
    company_name,
    sector,
    industry,
    comparison_basis,
    fiscal_year_start_month,
    currency,
    currency_unit,
    statement,
  } = body;

  if (!statement || typeof statement !== "object") {
    return NextResponse.json({ error: "Missing statement payload" }, { status: 400 });
  }

  const required = [
    "period_type",
    "period_label",
    "period_end_date",
    "basis",
    "revenue_from_operations",
    "profit_before_tax",
    "profit_after_tax",
  ];
  for (const field of required) {
    if (statement[field] === undefined || statement[field] === null) {
      return NextResponse.json(
        { error: `Missing required statement field: ${field}` },
        { status: 400 }
      );
    }
  }

  let workspace: Workspace;

  if (workspace_id) {
    const { data: wsData, error: wsError } = await supabase
      .from("sentinel_workspaces")
      .select("*")
      .eq("id", workspace_id)
      .single();
    if (wsError || !wsData) {
      return NextResponse.json(
        { error: "Workspace not found or not accessible" },
        { status: 404 }
      );
    }
    workspace = wsData as Workspace;
  } else {
    if (!company_name || !sector) {
      return NextResponse.json(
        { error: "Provide workspace_id, or company_name + sector to create a new workspace" },
        { status: 400 }
      );
    }
    try {
      getSectorConfig(sector); // throws if sector isn't configured
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid sector" },
        { status: 400 }
      );
    }

    const { data: newWs, error: createError } = await supabase
      .from("sentinel_workspaces")
      .insert({
        owner_id: userId,
        company_name,
        sector,
        industry: industry ?? null,
        is_public_reference: false,
        fiscal_year_start_month: fiscal_year_start_month ?? 4,
        currency: currency ?? "INR",
        currency_unit: currency_unit ?? "cr",
        comparison_basis: comparison_basis ?? "consolidated",
      })
      .select()
      .single();
    if (createError || !newWs) {
      return NextResponse.json(
        { error: createError?.message ?? "Workspace creation failed" },
        { status: 500 }
      );
    }
    workspace = newWs as Workspace;
  }

  const { data: existing, error: existingError } = await supabase
    .from("sentinel_statements")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("period_type", statement.period_type)
    .eq("period_label", statement.period_label)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  // Data Quality Layer: pull every other statement already on file for
  // this workspace (excluding the one we're about to update, if any) to
  // give the unit-mismatch and duplicate-date checks real context.
  const { data: allStatements, error: allStmtError } = await supabase
    .from("sentinel_statements")
    .select("id, period_label, period_end_date, revenue_from_operations")
    .eq("workspace_id", workspace.id);
  if (allStmtError) {
    return NextResponse.json({ error: allStmtError.message }, { status: 500 });
  }
  const priorStatements = (allStatements ?? []).filter((s) => s.id !== existing?.id);

  const { errors, warnings } = validateStatement(statement, priorStatements);
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: errors.length === 1 ? errors[0] : `${errors.length} data quality issues found`,
        details: errors,
      },
      { status: 422 }
    );
  }

  const row = { ...statement, workspace_id: workspace.id };

  if (existing) {
    const { error: updateError } = await supabase
      .from("sentinel_statements")
      .update(row)
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({
      status: "updated",
      workspace_id: workspace.id,
      statement_id: existing.id,
      warnings,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("sentinel_statements")
    .insert(row)
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({
    status: "created",
    workspace_id: workspace.id,
    statement_id: inserted.id,
    warnings,
  });
}
'''

path.write_text(content, encoding="utf-8")
print(f"OK — wrote {len(content.encode('utf-8'))} bytes to {path}")