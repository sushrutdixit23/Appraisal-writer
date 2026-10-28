"use client";

// (Route: /sentinel-review/<token>. /review/<token> belongs to the older client-review feature.)
// A shared investigation, for someone without an account: the finding, and a place to comment. The token in the URL is
// the only credential; the analyst can close the link at any time.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parseVerdict } from "../../sentinel/lib/format";
import type { ReviewView } from "../../sentinel/lib/discussion";

type Comment = { id: string; author_kind: string; author_label: string; body: string; created_at: string };
type Payload = { investigation: ReviewView; comments: Comment[]; reviewer_label: string | null };

export default function ReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/sentinel/review/${token}`).catch(() => null);
      const body = res ? ((await res.json().catch(() => ({}))) as Payload & { error?: string }) : null;
      if (!res || !res.ok || !body) { setProblem(body?.error ?? "This review link could not be opened."); return; }
      setData(body);
      if (body.reviewer_label) setName(body.reviewer_label);
    })();
  }, [token]);

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sentinel/review/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, body: text }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; comment?: Comment };
      if (!res.ok || !body.comment) { setMessage({ ok: false, text: body.error ?? `Something went wrong (${res.status}).` }); return; }
      setData((d) => (d ? { ...d, comments: [...d.comments, body.comment as Comment] } : d));
      setText("");
      setMessage({ ok: true, text: "Comment sent." });
    } catch {
      setMessage({ ok: false, text: "The comment could not be sent. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const box = { border: "1px solid #ddd", borderRadius: 4, padding: "0.9rem 1.1rem", margin: "0 0 1rem 0", background: "#fff" } as const;
  if (problem) return <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}><p role="alert" style={{ color: "#a12b2b" }}>{problem}</p></main>;
  if (!data) return <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}><p>Opening...</p></main>;

  const inv = data.investigation;
  const { verdict, body } = parseVerdict(inv.narrative);
  return (
    <main style={{ maxWidth: 680, margin: "3rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif", color: "#1a1a1a", lineHeight: 1.6 }}>
      <p style={{ fontSize: "0.8rem", color: "#666", margin: 0 }}>Shared for your review</p>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.2rem 0 1rem 0" }}>{inv.company_name} - {inv.period_label}</h1>
      <section style={box} aria-label="Finding">
        {verdict && <p style={{ fontWeight: 600, margin: "0 0 0.5rem 0" }}>{verdict}</p>}
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{body || "No narrative has been written for this investigation yet."}</p>
        {inv.confidence_score != null && <p style={{ fontSize: "0.82rem", color: "#666", margin: "0.7rem 0 0 0" }}>Confidence {inv.confidence_score}% (computed from the evidence, not stated by the model). Status: {inv.status}.</p>}
        {inv.untraced_figures > 0 && <p style={{ fontSize: "0.82rem", color: "#a12b2b", margin: "0.4rem 0 0 0" }}>{inv.untraced_figures} figure{inv.untraced_figures > 1 ? "s" : ""} in the narrative could not be traced to the data.</p>}
      </section>
      {inv.flags.length > 0 && (
        <section style={box} aria-label="Flags">
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.4rem 0" }}>What was flagged</h2>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.92rem" }}>{inv.flags.map((f, i) => <li key={i}>{f.description}</li>)}</ul>
        </section>
      )}
      {inv.questions.length > 0 && (
        <section style={box} aria-label="Questions">
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.4rem 0" }}>Questions to put to the company</h2>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.92rem" }}>{inv.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </section>
      )}
      <section aria-label="Discussion">
        <h2 style={{ fontSize: "1rem", margin: "1.4rem 0 0.6rem 0" }}>Discussion</h2>
        {data.comments.length === 0 && <p style={{ fontSize: "0.9rem", color: "#666" }}>No comments yet.</p>}
        {data.comments.map((c) => (
          <div key={c.id} style={{ ...box, background: c.author_kind === "owner" ? "#f3f6fb" : "#fff" }} data-testid="review-comment">
            <p style={{ fontSize: "0.78rem", color: "#666", margin: "0 0 0.25rem 0" }}>{c.author_label} - {c.created_at.slice(0, 16).replace("T", " ")}</p>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.92rem" }}>{c.body}</p>
          </div>
        ))}
        <label style={{ display: "block", fontSize: "0.82rem", margin: "1rem 0 0.2rem 0" }} htmlFor="rv-name">Your name</label>
        <input id="rv-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: "1px solid #bbb", borderRadius: 3 }} />
        <label style={{ display: "block", fontSize: "0.82rem", margin: "0.7rem 0 0.2rem 0" }} htmlFor="rv-body">Your comment</label>
        <textarea id="rv-body" value={text} maxLength={2000} rows={4} onChange={(e) => setText(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "0.5rem", border: "1px solid #bbb", borderRadius: 3, fontFamily: "inherit" }} />
        <button type="button" disabled={busy || !text.trim()} onClick={send} style={{ marginTop: "0.6rem", padding: "0.45rem 1rem" }}>{busy ? "Sending..." : "Send comment"}</button>
        {message && <p role="status" style={{ fontSize: "0.88rem", color: message.ok ? "#1a6b3a" : "#a12b2b" }}>{message.text}</p>}
      </section>
    </main>
  );
}
