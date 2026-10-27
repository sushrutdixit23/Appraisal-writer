"use client";

// Sentinel - the last changes to a company's statements: who, when, and what moved from what to what. Reads
// sentinel_statement_changes (migration 20261028000000_sentinel_audit.sql); the owner-only read policy decides what
// comes back. If the table does not exist yet, or there is nothing recorded, the panel stays out of the way.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ALL_FIELDS } from "../fields";
import { SANS, SERIF, T } from "../theme";

type Change = {
  id: string;
  statement_id: string | null;
  period_label: string | null;
  basis: string | null;
  action: "created" | "updated" | "deleted";
  changed_at: string;
  via: "api" | "browser";
  changes: Record<string, { old: unknown; new: unknown }>;
};

const labelOf = (key: string) => ALL_FIELDS.find((f) => f.key === key)?.label ?? key.replace(/_/g, " ");
const show = (v: unknown) => (v == null || v === "" ? "blank" : typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(v));

export function describeChange(c: Pick<Change, "action" | "changes">, max = 3): string {
  if (c.action === "created") return "Added";
  if (c.action === "deleted") return "Deleted (the full row is kept in the history)";
  const entries = Object.entries(c.changes);
  const shown = entries.slice(0, max).map(([k, v]) => `${labelOf(k)}: ${show(v.old)} to ${show(v.new)}`);
  return shown.join("; ") + (entries.length > max ? `; and ${entries.length - max} more` : "");
}

export function ChangeHistory({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<Change[] | null>(null);

  useEffect(() => {
    let live = true;
    supabase
      .from("sentinel_statement_changes")
      .select("id,statement_id,period_label,basis,action,changed_at,via,changes")
      .eq("workspace_id", workspaceId)
      .order("changed_at", { ascending: false })
      .limit(15)
      .then(({ data, error }) => {
        if (live) setRows(error ? null : ((data ?? []) as Change[]));
      });
    return () => { live = false; };
  }, [workspaceId]);

  if (!rows || rows.length === 0) return null;
  return (
    <section aria-label="Change history" style={{ marginBottom: "1.8rem" }} data-testid="change-history">
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.6rem 0" }}>Recent changes</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${T.rule}` }}>
        {rows.map((c) => (
          <li key={c.id} style={{ display: "grid", gridTemplateColumns: "9.5rem 8rem 1fr", gap: "0.8rem", padding: "0.55rem 0", borderBottom: `1px solid ${T.rule}`, fontSize: "0.82rem" }}>
            <time dateTime={c.changed_at} style={{ fontFamily: SANS, color: T.inkSoft }}>
              {new Date(c.changed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </time>
            <span style={{ fontWeight: 600 }}>{c.period_label ?? "-"}{c.basis ? ` ${c.basis}` : ""}</span>
            <span style={{ color: T.ink }}>{describeChange(c)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
