"use client";

// Sentinel - management commentary on the Results brief: upload or paste a call transcript and see what management said, each statement with its exact words,
// then what changed since the previous quarter's call. Statements the code could not trace to the transcript are dropped before they are shown. See lib/transcript.ts.

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { compareCommentary, TOPIC_LABEL, TOPICS, type CommentaryItem, type TopicChange } from "./transcript";
import { T } from "./theme";

export type StoredCommentary = { id: string; period_end_date: string; source_label: string | null; items: CommentaryItem[]; dropped_count: number; dropped_reasons: string[] };

const input: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.84rem", padding: "0.35rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.rule}` };
const DIRECTION: Record<string, { text: string; bg: string; fg: string }> = {
  positive: { text: "Positive", bg: "rgba(11,107,95,0.12)", fg: "#0b6b5f" },
  negative: { text: "Negative", bg: "rgba(140,30,30,0.14)", fg: T.oxblood },
  neutral: { text: "Neutral", bg: "rgba(0,0,0,0.06)", fg: T.inkSoft },
};
const Chip = ({ d }: { d: string }) => <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 2, background: DIRECTION[d].bg, color: DIRECTION[d].fg }}>{DIRECTION[d].text}</span>;

function describe(c: TopicChange): string {
  const label = TOPIC_LABEL[c.topic];
  if (c.status === "tone_shift") return `${label}: the tone moved from ${c.from} to ${c.to}.`;
  if (c.status === "new") return `${label}: new this call (${c.current.length} statement${c.current.length === 1 ? "" : "s"}).`;
  if (c.status === "dropped") return `${label}: discussed last call, not this one.`;
  return `${label}: same tone as last call (${c.to}).`;
}

export function CommentaryPanel({ workspaceId, periodEnd, periodLabel, previousEnd, previousLabel, stored, setUp, onChange }: {
  workspaceId: string; periodEnd: string; periodLabel: string; previousEnd: string; previousLabel: string; stored: StoredCommentary[]; setUp: boolean; onChange: () => void;
}) {
  const current = stored.find((s) => s.period_end_date === periodEnd) ?? null;
  const previous = stored.find((s) => s.period_end_date === previousEnd) ?? null;
  const [rereading, setRereading] = useState(false);
  const [pasted, setPasted] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function read(file: File | null) {
    if (!file && pasted.trim() === "") { setMessage({ ok: false, text: "Choose a transcript file or paste its text." }); return; }
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const form = new FormData();
      form.append("workspace_id", workspaceId);
      form.append("period_end_date", periodEnd);
      form.append("period_label", periodLabel);
      if (label.trim()) form.append("source_label", label.trim());
      if (file) form.append("file", file); else form.append("text", pasted);
      const res = await fetch("/api/sentinel/transcripts", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; items?: unknown[]; dropped_count?: number };
      if (!res.ok) { setMessage({ ok: false, text: body.error ?? "The transcript could not be read." }); return; }
      setPasted(""); setRereading(false);
      onChange();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`/api/sentinel/transcripts?id=${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) onChange();
  }

  if (!setUp) return <p style={{ fontSize: "0.82rem", color: T.inkSoft }}>Commentary is not set up on this database yet (run migration 20261109000000).</p>;

  const changes = current && previous ? compareCommentary(current.items, previous.items) : [];
  const form = (
    <div data-testid="commentary-form">
      <label style={{ fontSize: "0.74rem", color: T.inkSoft, display: "block", margin: "0 0 3px 0" }} htmlFor="tr-file">Transcript file (PDF with a text layer, or .txt)</label>
      <input id="tr-file" type="file" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Transcript file" disabled={busy} onChange={(e) => { read(e.target.files?.[0] ?? null); e.target.value = ""; }} style={{ fontSize: "0.85rem" }} />
      <label style={{ fontSize: "0.74rem", color: T.inkSoft, display: "block", margin: "0.7rem 0 3px 0" }} htmlFor="tr-text">Or paste the transcript</label>
      <textarea id="tr-text" rows={5} style={{ ...input, resize: "vertical" }} value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={busy} />
      <div style={{ display: "flex", gap: "0.7rem", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <input aria-label="Label (optional)" style={{ ...input, width: 220 }} placeholder="Label, e.g. Q2 FY27 call" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        <button type="button" style={btn} disabled={busy} onClick={() => read(null)} data-testid="read-transcript">{busy ? "Reading... up to a minute" : "Read pasted text"}</button>
        {rereading && <button type="button" style={ghost} onClick={() => setRereading(false)}>Cancel</button>}
      </div>
    </div>
  );

  return (
    <div data-testid="commentary-panel">
      {message && <p role="alert" style={{ fontSize: "0.82rem", color: T.oxblood, margin: "0 0 0.6rem 0" }}>{message.text}</p>}
      {!current || rereading ? (
        <>
          <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0 0 0.7rem 0", lineHeight: 1.5 }}>
            The model picks out what management said; the code then keeps a statement only if its exact words are in the transcript. The transcript itself is not stored.
          </p>
          {form}
        </>
      ) : (
        <>
          <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>
            {current.items.length} statement{current.items.length === 1 ? "" : "s"}{current.source_label ? ` from "${current.source_label}"` : ""}.
            {current.dropped_count > 0 && <span data-testid="commentary-dropped"> {current.dropped_count} more {current.dropped_count === 1 ? "was" : "were"} dropped because they could not be traced to the transcript ({current.dropped_reasons.join("; ")}).</span>}
            {" "}<button type="button" style={{ ...ghost, padding: "0.15rem 0.6rem" }} onClick={() => setRereading(true)}>Read again</button>{" "}
            <button type="button" style={{ ...ghost, padding: "0.15rem 0.6rem" }} onClick={() => remove(current.id)}>Remove</button>
          </p>
          {previous ? (
            <div style={{ marginBottom: "1rem" }} data-testid="commentary-changes">
              <div style={{ fontWeight: 500, fontSize: "0.92rem", marginBottom: "0.3rem" }}>Since {previousLabel}</div>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.86rem", lineHeight: 1.6 }}>
                {changes.filter((c) => c.status !== "continued").map((c) => <li key={c.topic}>{describe(c)}</li>)}
                {changes.every((c) => c.status === "continued") && <li>No topic changed tone, appeared or disappeared.</li>}
              </ul>
              {changes.some((c) => c.status === "continued") && <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0.3rem 0 0 0" }}>Unchanged in tone: {changes.filter((c) => c.status === "continued").map((c) => TOPIC_LABEL[c.topic]).join(", ")}.</p>}
            </div>
          ) : (
            <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 0.9rem 0" }}>Read {previousLabel}&apos;s call as well to see what changed between the two.</p>
          )}
          {TOPICS.filter((t) => current.items.some((i) => i.topic === t.key)).map((t) => (
            <div key={t.key} style={{ marginBottom: "0.9rem" }}>
              <div style={{ fontFamily: "inherit", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, borderBottom: `1px solid ${T.rule}`, paddingBottom: 3, marginBottom: 4 }}>{t.label}</div>
              {current.items.filter((i) => i.topic === t.key).map((i, n) => (
                <div key={n} style={{ padding: "0.45rem 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><Chip d={i.direction} /><span style={{ fontSize: "0.7rem", color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i.kind}</span><span style={{ fontSize: "0.9rem", fontWeight: 500 }}>{i.statement}</span></div>
                  <div style={{ fontSize: "0.8rem", color: T.inkSoft, fontStyle: "italic", marginTop: 2, lineHeight: 1.5 }}>&ldquo;{i.quote}&rdquo;{i.speaker ? ` - ${i.speaker}` : ""}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
