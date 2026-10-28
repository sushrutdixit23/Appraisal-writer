"use client";

// The CA's upload page: no login, one purpose. The token in the URL is the only credential.

import { useParams } from "next/navigation";
import { useState } from "react";

export default function SubmitPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/sentinel/submit/${token}`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; periods?: number; figures?: number; warnings?: string[] };
      setMessage(
        res.ok
          ? { ok: true, text: `Received. ${body.figures ?? 0} figure(s) read across ${body.periods ?? 0} period(s); your analyst will review them before anything is recorded.${body.warnings?.length ? ` Note: ${body.warnings.join(" ")}` : ""}` }
          : { ok: false, text: body.error ?? `Something went wrong (${res.status}).` }
      );
    } catch {
      setMessage({ ok: false, text: "The upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif", color: "#1a1a1a", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Send financial figures</h1>
      <p style={{ fontSize: "0.92rem", color: "#555" }}>
        Upload your trial balance or financial statements (a Tally, Zoho or Excel export, a .csv, or a text PDF; up to 4MB). Your analyst reviews what was
        read before anything is recorded.
      </p>
      <input type="file" accept=".csv,.xlsx,.pdf,.txt" disabled={busy} onChange={(e) => send(e.target.files?.[0] ?? null)} />
      {busy && <p style={{ fontSize: "0.9rem" }}>Reading the file...</p>}
      {message && <p role="status" style={{ fontSize: "0.9rem", color: message.ok ? "#1a6b3a" : "#a12b2b" }}>{message.text}</p>}
    </main>
  );
}
