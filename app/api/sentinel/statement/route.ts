// Sentinel — manual data entry endpoint. Built to unblock end-to-end
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

  const row = { ...statement, workspace_id: workspace.id };

  if (existing) {
    const { error: updateError } = await supabase
      .from("sentinel_statements")
      .update(row)
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ status: "updated", workspace_id: workspace.id, statement_id: existing.id });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("sentinel_statements")
    .insert(row)
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ status: "created", workspace_id: workspace.id, statement_id: inserted.id });
}
