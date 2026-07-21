"use client";
export const dynamic = "force-dynamic";

// Sentinel — Review Queue. The approval-gated layer: nothing generated
// here is "the analysis" until a human approves it (with or without
// edits) or rejects it. Statements load from Supabase (RLS: public demo
// rows + the user's own), the engine and detectors run client-side (pure
// functions, small data), and review actions write directly through RLS.
// Only narrative generation goes through the API route — that's the one
// step needing the server-side ANTHROPIC_API_KEY.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { groupFlagsByCompany, runAllChecks } from "./lib/anomaly";
import { buildPeerTable } from "./lib/engine";
import { SERIF, T } from "./lib/theme";
import type {
  AnomalyFlag,
  FinancialStatement,
  SentinelReview,
} from "./lib/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  edited: "Approved · edited",
  rejected: "Rejected",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.66rem",
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: T.accent,
        margin: "1rem 0 0.35rem 0",
      }}
    >
      {children}
    </p>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "approved" || status === "edited"
      ? T.accent
      : status === "rejected"
        ? T.ink
        : T.inkSoft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "0.68rem",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "0.28rem 0.7rem",
        border: `1px solid ${color}`,
        color,
      }}
    >
      <span style={{ width: 5, height: 5, background: color }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function FlagChip({ flag }: { flag: AnomalyFlag }) {
  return (
    <div
      style={{
        background: T.accentSoft,
        borderLeft: `2px solid ${T.accent}`,
        padding: "0.6rem 0.9rem",
        marginBottom: "0.45rem",
        fontSize: "0.9rem",
      }}
    >
      <span
        style={{
          fontSize: "0.66rem",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: T.accent,
          marginRight: "0.55rem",
        }}
      >
        {flag.flag_type}
      </span>
      {flag.description}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  fontWeight: 500,
  padding: "0.5rem 1.1rem",
  border: `1px solid ${T.ink}`,
  borderRadius: 3,
  background: "transparent",
  color: T.ink,
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: T.ink,
  color: T.background,
};

export default function ReviewQueuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [reviews, setReviews] = useState<Map<string, SentinelReview>>(
    new Map()
  );
  const [generating, setGenerating] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push("/login");
      return;
    }
    const [stmtRes, reviewRes] = await Promise.all([
      supabase.from("sentinel_statements").select("*"),
      supabase.from("sentinel_reviews").select("*"),
    ]);
    if (stmtRes.error) {
      setError(stmtRes.error.message);
    } else {
      setStatements((stmtRes.data ?? []) as FinancialStatement[]);
    }
    if (!reviewRes.error) {
      const m = new Map<string, SentinelReview>();
      for (const r of (reviewRes.data ?? []) as SentinelReview[]) {
        m.set(r.company_id, r);
      }
      setReviews(m);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) {
    return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  }
  if (error) {
    return <p style={{ color: T.ink }}>Could not load data: {error}</p>;
  }

  const peerRows = buildPeerTable(statements, "FY");
  const flags = runAllChecks(peerRows);
  const groups = groupFlagsByCompany(flags);

  const notGenerated = groups.filter(
    (g) => !reviews.has(g[0].company_id)
  ).length;
  const pending = [...reviews.values()].filter(
    (r) => r.status === "pending"
  ).length;
  const approvedCount = [...reviews.values()].filter(
    (r) => r.status === "approved" || r.status === "edited"
  ).length;
  const rejected = [...reviews.values()].filter(
    (r) => r.status === "rejected"
  ).length;

  async function generateDraft(companyId: string, periodLabel: string) {
    setGenerating(companyId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/narrative", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ company_id: companyId, period_label: periodLabel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      await loadAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Draft generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function decide(
    review: SentinelReview,
    decision: "approve" | "reject"
  ) {
    const editedText = edits[review.company_id] ?? review.ai_narrative ?? "";
    const reviewerNotes = notes[review.company_id] || null;
    const update =
      decision === "approve"
        ? {
            status: editedText === review.ai_narrative ? "approved" : "edited",
            final_narrative: editedText,
            reviewer_notes: reviewerNotes,
            updated_at: new Date().toISOString(),
          }
        : {
            status: "rejected",
            final_narrative: null,
            reviewer_notes: reviewerNotes,
            updated_at: new Date().toISOString(),
          };
    const { error: updateError } = await supabase
      .from("sentinel_reviews")
      .update(update)
      .eq("id", review.id);
    if (updateError) {
      alert(updateError.message);
      return;
    }
    await loadAll();
  }

  async function reopen(review: SentinelReview) {
    const { error: updateError } = await supabase
      .from("sentinel_reviews")
      .update({
        status: "pending",
        final_narrative: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id);
    if (updateError) {
      alert(updateError.message);
      return;
    }
    await loadAll();
  }

  const stats: [string, number][] = [
    ["Not generated", notGenerated],
    ["Pending review", pending],
    ["Approved", approvedCount],
    ["Rejected", rejected],
  ];

  return (
    <div>
      <h1
        style={{
          fontFamily: SERIF,
          fontWeight: 600,
          fontSize: "2.1rem",
          margin: 0,
          letterSpacing: "-0.005em",
        }}
      >
        Review Queue
      </h1>
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0.45rem 0 1.6rem 0",
        }}
      >
        Tyre Manufacturing · FY26 · Nothing below is final until approved
      </p>

      {/* Stat strip: flat bordered cells, hairline-divided */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: T.rule,
          border: `1px solid ${T.rule}`,
          marginBottom: "1.75rem",
        }}
      >
        {stats.map(([label, value], i) => (
          <div key={label} style={{ background: T.card, padding: "1rem 1.25rem" }}>
            <p
              style={{
                fontSize: "0.64rem",
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: T.inkSoft,
                margin: "0 0 0.35rem 0",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "1.8rem",
                fontWeight: 500,
                color: i === 2 ? T.accent : T.ink,
                margin: 0,
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {groups.map((group) => {
        const companyId = group[0].company_id;
        const companyName = group[0].company_name;
        const periodLabel = group[0].period_label;
        const review = reviews.get(companyId);

        return (
          <div
            key={companyId}
            style={{
              background: T.card,
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              padding: "1.4rem 1.7rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.8rem",
              }}
            >
              <h3
                style={{
                  fontFamily: SERIF,
                  fontWeight: 500,
                  fontSize: "1.25rem",
                  margin: 0,
                }}
              >
                {companyName}
                <span
                  style={{
                    fontFamily: "inherit",
                    fontSize: "0.8rem",
                    color: T.inkSoft,
                    marginLeft: "0.6rem",
                  }}
                >
                  {group.length} flag{group.length > 1 ? "s" : ""}
                </span>
              </h3>
              {review && <StatusPill status={review.status} />}
            </div>

            {group.map((f, i) => (
              <FlagChip key={i} flag={f} />
            ))}

            {!review && (
              <div style={{ marginTop: "0.9rem" }}>
                <button
                  style={btnPrimary}
                  disabled={generating !== null}
                  onClick={() => generateDraft(companyId, periodLabel)}
                >
                  {generating === companyId
                    ? "Drafting — hypothesis, then peer check…"
                    : "Generate draft narrative"}
                </button>
              </div>
            )}

            {review && review.status === "pending" && (
              <div>
                <Eyebrow>Turn 1 — hypothesis, from the company&apos;s own data</Eyebrow>
                <p style={{ fontSize: "0.93rem", lineHeight: 1.65, margin: 0 }}>
                  {review.initial_hypothesis}
                </p>
                <Eyebrow>Turn 2 — draft narrative, checked against peers</Eyebrow>
                <p style={{ fontSize: "0.93rem", lineHeight: 1.65, margin: 0 }}>
                  {review.ai_narrative}
                </p>

                <textarea
                  value={edits[companyId] ?? review.ai_narrative ?? ""}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [companyId]: e.target.value }))
                  }
                  rows={5}
                  style={{
                    width: "100%",
                    marginTop: "1rem",
                    padding: "0.7rem",
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                    border: `1px solid ${T.rule}`,
                    borderRadius: 3,
                    background: T.background,
                    color: T.ink,
                    resize: "vertical",
                  }}
                />
                <input
                  value={notes[companyId] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [companyId]: e.target.value }))
                  }
                  placeholder="Reviewer notes (optional)"
                  style={{
                    width: "100%",
                    marginTop: "0.5rem",
                    padding: "0.55rem 0.7rem",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                    border: `1px solid ${T.rule}`,
                    borderRadius: 3,
                    background: T.card,
                    color: T.ink,
                  }}
                />
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem" }}>
                  <button style={btnPrimary} onClick={() => decide(review, "approve")}>
                    Approve
                  </button>
                  <button style={btnBase} onClick={() => decide(review, "reject")}>
                    Reject
                  </button>
                  <button
                    style={btnBase}
                    disabled={generating !== null}
                    onClick={() => generateDraft(companyId, periodLabel)}
                  >
                    {generating === companyId ? "Regenerating…" : "Regenerate draft"}
                  </button>
                </div>
              </div>
            )}

            {review && review.status !== "pending" && (
              <div style={{ marginTop: "0.8rem" }}>
                {review.status === "rejected" ? (
                  <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: 0 }}>
                    {review.reviewer_notes ?? "No notes given."}
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: "0.93rem", lineHeight: 1.65, margin: 0 }}>
                      {review.final_narrative}
                    </p>
                    {review.reviewer_notes && (
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: T.inkSoft,
                          margin: "0.5rem 0 0 0",
                        }}
                      >
                        Reviewer notes: {review.reviewer_notes}
                      </p>
                    )}
                  </>
                )}
                <button
                  style={{ ...btnBase, marginTop: "0.8rem" }}
                  onClick={() => reopen(review)}
                >
                  Re-open for review
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
