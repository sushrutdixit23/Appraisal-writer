"use client";

// Sentinel - the discussion on one investigation: the thread, a box for the analyst's own comment, and "share for review"
// - a link a colleague, client or CA opens without an account to read this one investigation and comment. The link is shown
// once (only a hash is kept), expires, and can be revoked here. See lib/discussion.ts.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { SERIF, T } from "./theme";

type Comment = { id: string; author_kind: "owner" | "reviewer"; author_label: string; body: string; created_at: string; read: boolean };
type LinkRow = { id: string; label: string | null; expires_at: string; created_at: string; state: "active" | "expired" | "revoked" };

const input: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.84rem", padding: "0.35rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.rule}` };

export function Discussion({ investigationId }: { investigationId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [setUp, setSetUp] = useState(true);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(14);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  }, []);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([call(`/api/sentinel/comments?investigation_id=${investigationId}`), call(`/api/sentinel/review-links?investigation_id=${investigationId}`)]);
    if (c.ok) {
      const body = (await c.json()) as { comments: Comment[]; set_up: boolean };
      setComments(body.comments);
      setSetUp(body.set_up);
    } else setComments([]);
    if (l.ok) setLinks(((await l.json()) as { links: LinkRow[] }).links);
  }, [call, investigationId]);

  // The count is loaded up front so the closed panel can say how many are waiting; opening it marks them read.
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open || !comments?.some((c) => c.author_kind === "reviewer" && !c.read)) return;
    call("/api/sentinel/comments", { method: "PATCH", body: JSON.stringify({ investigation_id: investigationId }) }).then(() => setComments((cs) => (cs ?? []).map((c) => ({ ...c, read: true }))));
  }, [open, comments, call, investigationId]);

  async function post() {
    setError(null);
    setBusy(true);
    try {
      const res = await call("/api/sentinel/comments", { method: "POST", body: JSON.stringify({ investigation_id: investigationId, body: text }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; comment?: Comment };
      if (!res.ok || !body.comment) { setError(body.error ?? "The comment could not be posted."); return; }
      setComments((cs) => [...(cs ?? []), body.comment as Comment]);
      setText("");
    } finally { setBusy(false); }
  }

  async function share() {
    setError(null);
    setFresh(null);
    setBusy(true);
    try {
      const res = await call("/api/sentinel/review-links", { method: "POST", body: JSON.stringify({ investigation_id: investigationId, label: label.trim() || undefined, days }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; review_path?: string };
      if (!res.ok || !body.review_path) { setError(body.error ?? "The link could not be created."); return; }
      setFresh(`${window.location.origin}${body.review_path}`);
      setLabel("");
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    const res = await call(`/api/sentinel/review-links?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  const unread = (comments ?? []).filter((c) => c.author_kind === "reviewer" && !c.read).length;
  const count = comments?.length ?? 0;
  return (
    <section aria-label="Discussion" data-testid="discussion" style={{ marginTop: "1rem", borderTop: `1px solid ${T.rule}`, paddingTop: "0.7rem" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ ...ghost, border: "none", padding: 0, fontFamily: SERIF, fontSize: "0.98rem" }} data-testid="discussion-toggle">
        Discussion ({count}){unread > 0 ? ` - ${unread} unread` : ""} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          {!setUp && <p style={{ fontSize: "0.82rem", color: T.inkSoft }}>Discussion is not set up on this database yet (run migration 20261107000000).</p>}
          {(comments ?? []).map((c) => (
            <div key={c.id} data-testid="comment" style={{ padding: "0.5rem 0", borderTop: `1px solid ${T.rule}` }}>
              <p style={{ margin: 0, fontSize: "0.74rem", color: T.inkSoft }}>{c.author_label}{c.author_kind === "reviewer" ? " (via review link)" : ""} - {c.created_at.slice(0, 16).replace("T", " ")}</p>
              <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.88rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</p>
            </div>
          ))}
          {setUp && (
            <>
              <textarea aria-label="Add a comment" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Add a comment to the thread" style={{ ...input, width: "100%", boxSizing: "border-box", marginTop: "0.6rem", resize: "vertical" }} />
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.4rem", flexWrap: "wrap" }}>
                <button type="button" style={btn} disabled={busy || !text.trim()} onClick={post} data-testid="post-comment">Post comment</button>
                <span style={{ fontSize: "0.78rem", color: T.inkSoft }}>Share for review:</span>
                <input aria-label="Reviewer name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reviewer (optional)" style={{ ...input, width: 150 }} />
                <select aria-label="Link valid for" value={days} onChange={(e) => setDays(Number(e.target.value))} style={input}>
                  {[3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
                <button type="button" style={ghost} disabled={busy} onClick={share} data-testid="share-review">Create link</button>
              </div>
            </>
          )}
          {error && <p role="alert" style={{ fontSize: "0.82rem", color: T.oxblood, margin: "0.4rem 0 0 0" }}>{error}</p>}
          {fresh && (
            <p style={{ fontSize: "0.82rem", margin: "0.5rem 0 0 0", wordBreak: "break-all" }} data-testid="review-link">
              Send this link (it is shown only now): <strong>{fresh}</strong>
            </p>
          )}
          {links.length > 0 && (
            <ul style={{ listStyle: "none", margin: "0.5rem 0 0 0", padding: 0, fontSize: "0.8rem", color: T.inkSoft }}>
              {links.map((l) => (
                <li key={l.id} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.15rem 0" }}>
                  <span>{l.label ?? "Review link"} - {l.state === "active" ? `open until ${l.expires_at.slice(0, 10)}` : l.state}</span>
                  {l.state === "active" && <button type="button" style={{ ...ghost, padding: "0.15rem 0.6rem" }} onClick={() => revoke(l.id)}>Close link</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
