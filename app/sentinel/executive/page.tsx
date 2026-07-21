"use client";
export const dynamic = "force-dynamic";

// Sentinel — Executive Dashboard. Read-only, approved-output-only. An
// executive should never see an unreviewed AI draft here — if a review
// isn't approved/edited, it doesn't appear on this page at all,
// regardless of how confident the draft narrative reads.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildPeerTable } from "../lib/engine";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, SentinelReview } from "../lib/types";

export default function ExecutiveDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [reviews, setReviews] = useState<SentinelReview[]>([]);

  useEffect(() => {
    (async () => {
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
        setReviews((reviewRes.data ?? []) as SentinelReview[]);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;

  const peerRows = buildPeerTable(statements, "FY");
  const peerLookup = new Map(peerRows.map((r) => [r.company_id, r]));

  const companyIds = new Set(
    statements.filter((s) => s.period_type === "FY").map((s) => s.company_id)
  );
  const approved = reviews.filter(
    (r) => r.status === "approved" || r.status === "edited"
  );

  const withGrowth = approved.map((r) => {
    const growth = peerLookup.get(r.company_id)?.ratios.yoy_pat_growth ?? null;
    return { review: r, absGrowth: growth != null ? Math.abs(growth) : 0, growth };
  });
  withGrowth.sort((a, b) => b.absGrowth - a.absGrowth);

  const stats: [string, number][] = [
    ["Companies in peer set", companyIds.size],
    ["Reviewed", reviews.length],
    ["Approved", approved.length],
    ["Awaiting review", Math.max(0, companyIds.size - reviews.length)],
  ];

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Executive Dashboard
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
        Approved findings only — every item here has a human sign-off
      </p>

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

      {withGrowth.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: T.inkSoft }}>
          Nothing has been approved yet. Generate and approve narratives in the
          Review Queue — only signed-off findings ever appear here.
        </p>
      ) : (
        withGrowth.map(({ review, growth }) => (
          <div
            key={review.id}
            style={{
              background: T.card,
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              padding: "1.6rem 1.9rem",
              marginBottom: "1.4rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1rem",
              }}
            >
              <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: 0 }}>
                {review.company_name}
              </h3>
              {growth != null && (
                <span style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                  <span style={{ fontWeight: 600 }}>
                    {growth > 0 ? "▲" : "▼"} {growth >= 0 ? "+" : ""}
                    {(growth * 100).toFixed(1)}%
                  </span>{" "}
                  <span style={{ color: T.inkSoft, fontSize: "0.78rem" }}>PAT YoY</span>
                </span>
              )}
            </div>
            <div style={{ margin: "0.6rem 0 1rem 0" }}>
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
                  border: `1px solid ${T.accent}`,
                  color: T.accent,
                }}
              >
                <span style={{ width: 5, height: 5, background: T.accent }} />
                {review.status === "edited" ? "Approved · edited" : "Approved"}
              </span>
            </div>
            <p style={{ fontSize: "0.97rem", lineHeight: 1.65, whiteSpace: "pre-line", margin: 0 }}>
              {review.final_narrative}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
