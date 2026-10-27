// Sentinel - source and change history for statements (the tables are in
// supabase/migrations/20261028000000_sentinel_audit.sql). Pure helpers plus two best-effort writers: history is
// valuable but a missing table (migration not applied yet) or a failed write must never stop a person saving
// their figures, so the writers report whether they recorded anything and never throw.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_FIELD_KEYS } from "./fields";

export type SourceKind = "typed" | "rules" | "ai" | "derived";
export type FieldSource = { kind: SourceKind; detail: string | null };
export type FieldChange = { old: unknown; new: unknown };

const TRACKED = [
  "period_type", "period_label", "period_end_date", "basis", "source_file", "source_page", "extraction_notes",
  ...ALL_FIELD_KEYS,
] as const;

const norm = (v: unknown) => (v === undefined || v === "" ? null : v);

/** Every tracked field whose value differs between the stored row and the row being saved. Numbers compare as
 * numbers, so 100 and 100.0 are not a change; a missing value and null are the same. */
export function diffStatement(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {};
  for (const key of TRACKED) {
    const a = norm(before[key]);
    const b = norm(after[key]);
    if (a !== b) out[key] = { old: a, new: b };
  }
  return out;
}

/** The free text the forms carry per field ("Read from p.5 | Revenue...", "Worked out: ...", "Read by an AI model...")
 * as a kind plus the detail. Anything that is not recognisably machine-made is left out: absence means typed. */
export function classifySource(text: string): FieldSource | null {
  const t = text.trim();
  if (!t) return null;
  if (/^Worked out:/i.test(t)) return { kind: "derived", detail: t.slice(0, 500) };
  if (/^Read by an AI model/i.test(t)) return { kind: "ai", detail: t.slice(0, 500) };
  if (/^Read from/i.test(t)) return { kind: "rules", detail: t.slice(0, 500) };
  return null;
}

/** From the request: only known fields with a recognised source, and only fields that were actually saved. */
export function readSources(raw: unknown, saved: Record<string, unknown>): Record<string, FieldSource> {
  const out: Record<string, FieldSource> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of ALL_FIELD_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== "string" || saved[key] == null) continue;
    const s = classifySource(v);
    if (s) out[key] = s;
  }
  return out;
}

const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST204";

export async function recordChange(
  admin: SupabaseClient,
  entry: { workspaceId: string; statementId: string | null; periodLabel: string; basis: string; action: "created" | "updated" | "deleted"; userId: string; changes: Record<string, FieldChange> }
): Promise<boolean> {
  if (entry.action === "updated" && Object.keys(entry.changes).length === 0) return false;
  const { error } = await admin.from("sentinel_statement_changes").insert({
    workspace_id: entry.workspaceId, statement_id: entry.statementId, period_label: entry.periodLabel, basis: entry.basis,
    action: entry.action, changed_by: entry.userId, via: "api", changes: entry.changes,
  });
  if (error && !isMissingTable(error.code)) console.error("Sentinel history write failed:", error.message);
  return !error;
}

export async function recordSources(
  admin: SupabaseClient,
  workspaceId: string,
  statementId: string,
  sources: Record<string, FieldSource>
): Promise<boolean> {
  const rows = Object.entries(sources).map(([field, s]) => ({
    statement_id: statementId, workspace_id: workspaceId, field, kind: s.kind, detail: s.detail, recorded_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return false;
  const { error } = await admin.from("sentinel_field_sources").upsert(rows, { onConflict: "statement_id,field" });
  if (error && !isMissingTable(error.code)) console.error("Sentinel source write failed:", error.message);
  return !error;
}
