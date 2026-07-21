"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import ZyntaskLoader from "../components/ZyntaskLoader";

type Relationship = {
  id: string;
  client_id: string;
  chat_id: string;
  display_name: string;
  first_interaction_at: string;
  last_contact_at: string;
  message_count: number;
  replied_count: number;
  avg_reply_seconds: number | null;
  stage: string;
};

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  new_contact: { label: "New contact", color: "#4A9EFF", bg: "rgba(74,158,255,0.12)" },
  warm_connection: { label: "Warm connection", color: "#F5A623", bg: "rgba(245,166,35,0.12)" },
  active_relationship: { label: "Active", color: "#34D399", bg: "rgba(52,211,153,0.12)" },
};

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatAgo(iso: string) {
  const d = daysSince(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function formatReplyTime(seconds: number | null) {
  if (seconds == null) return "-";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// Health is derived from recency, client-side. Kept separate from `stage`
// (which also weighs message depth) so a deep-but-fading relationship can
// read as "Active" stage with "Cooling" health - that combination is
// exactly the follow-up signal this page exists to surface.
function health(lastContactIso: string) {
  const d = daysSince(lastContactIso);
  if (d <= 7) return { label: "Strong", color: "#34D399" };
  if (d <= 21) return { label: "Steady", color: "#4A9EFF" };
  if (d <= 45) return { label: "Cooling", color: "#F5A623" };
  return { label: "Dormant", color: "#F43F5E" };
}

function responseRate(r: Relationship) {
  if (r.message_count === 0) return null;
  return Math.round((r.replied_count / r.message_count) * 100);
}

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? { label: stage, color: "#9b95a8", bg: "rgba(255,255,255,0.06)" };
  return (
    <span
      className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.label}
    </span>
  );
}

function RelationshipCard({ rel }: { rel: Relationship }) {
  const h = health(rel.last_contact_at);
  const rate = responseRate(rel);
  const stats: { label: string; value: string; accent?: string }[] = [
    { label: "First interaction", value: formatMonth(rel.first_interaction_at) },
    { label: "Last contact", value: formatAgo(rel.last_contact_at) },
    { label: "Messages", value: String(rel.message_count) },
    { label: "You replied", value: `${rel.replied_count} of ${rel.message_count}` },
    { label: "Your response rate", value: rate == null ? "-" : `${rate}%` },
    { label: "Avg reply time", value: formatReplyTime(rel.avg_reply_seconds) },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-serif text-lg flex-shrink-0 text-white"
            style={{ background: ACCENT }}
          >
            {rel.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-[17px] font-semibold text-white tracking-[-0.01em]">{rel.display_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <StageBadge stage={rel.stage} />
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: h.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: h.color }} />
                {h.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl px-3.5 py-3 border border-white/[0.07]"
            style={{ background: "rgba(255,255,255,0.025)" }}
          >
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-0.5">{s.label}</p>
            <p className="text-[14px] font-semibold text-white tracking-[-0.005em]">{s.value}</p>
          </div>
        ))}
      </div>

      {h.label === "Cooling" || h.label === "Dormant" ? (
        <div
          className="mt-4 rounded-xl px-3.5 py-3 border"
          style={{
            background: "linear-gradient(135deg, rgba(245,166,35,0.10), rgba(245,140,35,0.05))",
            borderColor: "rgba(245,166,35,0.25)",
          }}
        >
          <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#F5A623" }}>
            Worth a follow-up
          </p>
          <p className="text-[12.5px] text-white/80 leading-relaxed">
            No contact in {daysSince(rel.last_contact_at)} days. A short check-in keeps this one alive.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function Relationships() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/?signin=true");
        return;
      }
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();
      if (clientRow) {
        const { data } = await supabase
          .from("relationships")
          .select("*")
          .eq("client_id", clientRow.id)
          .order("last_contact_at", { ascending: false });
        const rows = (data ?? []) as Relationship[];
        setRels(rows);
        setSelectedId(rows[0]?.id ?? null);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <main className="relative min-h-screen flex items-center justify-center bg-ink overflow-hidden">
        <div className="aurora-page-dark" />
        <div className="relative z-10">
          <ZyntaskLoader />
        </div>
      </main>
    );
  }

  const visible = stageFilter === "all" ? rels : rels.filter((r) => r.stage === stageFilter);
  const selected = rels.find((r) => r.id === selectedId);
  const stages = ["all", "active_relationship", "warm_connection", "new_contact"];

  return (
    <main className="relative min-h-screen bg-ink overflow-x-hidden font-display">
      <div className="aurora-page-dark" />
      <div className="relative z-10">
        {/* Header */}
        <div
          className="sticky top-0 z-30 backdrop-blur-xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,23,42,0.55) 0%, rgba(15,17,30,0.25) 70%, rgba(15,17,30,0) 100%)",
          }}
        >
          <div className="max-w-6xl mx-auto px-4 md:px-8 h-[62px] md:h-[72px] flex items-center justify-between gap-6">
            <span className="relative font-serif font-semibold text-2xl md:text-3xl text-white tracking-tight flex items-center gap-2.5">
              Relationships<span style={{ color: "#8a6ff0" }}>.</span>
            </span>
            <a
              href="/dashboard"
              className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide"
            >
              Dashboard
            </a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-7 py-5 md:py-10">
          <div className="md:grid md:grid-cols-[320px_1fr] md:gap-6">
            {/* Left panel - list */}
            <div
              className="rounded-[24px] overflow-hidden border border-white/[0.10] md:h-[calc(100vh-160px)] md:flex md:flex-col"
              style={{
                background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)",
              }}
            >
              <div className="px-4 md:px-5 py-4 border-b border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-light/75">
                    Your network
                  </span>
                  <span className="text-[11px] font-mono text-slate-light">
                    {visible.length} of {rels.length}
                  </span>
                </div>
                <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                  {stages.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStageFilter(s)}
                      className="flex-1 text-[10px] font-medium py-2 rounded-lg transition-all duration-200"
                      style={stageFilter === s ? { background: ACCENT, color: "#fff" } : { color: "#9b95a8" }}
                    >
                      {s === "all" ? "All" : STAGE_META[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 md:overflow-y-auto no-scrollbar">
                {visible.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[13px] text-slate-light">
                    {rels.length === 0
                      ? "No relationships yet. They build automatically as you exchange DMs."
                      : "Nothing matches this filter."}
                  </div>
                ) : (
                  visible.map((rel) => {
                    const h = health(rel.last_contact_at);
                    return (
                      <button
                        key={rel.id}
                        onClick={() => {
                          setSelectedId(rel.id);
                          setSheetOpen(true);
                        }}
                        className="w-full text-left px-4 md:px-5 py-4 border-b border-white/10 last:border-0 transition-colors active:bg-white/5"
                        style={
                          rel.id === selectedId
                            ? {
                                background: "linear-gradient(90deg, rgba(91,75,255,0.10), rgba(91,75,255,0.02))",
                                borderLeft: "3px solid #7A6CFF",
                                boxShadow: "inset 0 0 0 1px rgba(122,108,255,0.08)",
                              }
                            : { borderLeft: "3px solid transparent", opacity: 0.82 }
                        }
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: h.color }}
                              title={h.label}
                            />
                            <span className="text-[14px] font-semibold text-white/95 truncate tracking-[-0.005em]">
                              {rel.display_name}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-slate-light flex-shrink-0">
                            {formatAgo(rel.last_contact_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StageBadge stage={rel.stage} />
                          <span className="text-[11px] text-slate-light/75">
                            {rel.message_count} message{rel.message_count === 1 ? "" : "s"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right panel - desktop detail */}
            <div className="hidden md:block">
              {selected ? (
                <div
                  className="rounded-[24px] p-8 overflow-y-auto no-scrollbar border border-white/[0.10] md:h-[calc(100vh-160px)]"
                  style={{
                    background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)",
                    boxShadow:
                      "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)",
                  }}
                >
                  <RelationshipCard rel={selected} />
                </div>
              ) : (
                <div
                  className="rounded-[24px] p-12 text-center border border-white/[0.10] md:h-[calc(100vh-160px)] md:flex md:flex-col md:items-center md:justify-center"
                  style={{
                    background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)",
                    boxShadow:
                      "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)",
                  }}
                >
                  <p className="font-serif text-2xl text-white mb-2">No relationships yet.</p>
                  <p className="text-slate-light text-sm">
                    Relationship profiles build automatically as you exchange DMs on LinkedIn.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile bottom sheet */}
        {sheetOpen && selected && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
            <div
              className="relative border-t border-white/[0.08] rounded-t-[28px] max-h-[90vh] flex flex-col px-5 pt-4 pb-8"
              style={{
                background: "linear-gradient(180deg, #161A2E 0%, #0F1120 100%)",
                boxShadow: "0 -20px 60px -10px rgba(0,0,0,0.6)",
              }}
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <button
                onClick={() => setSheetOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5l-10 10" />
                </svg>
              </button>
              <div className="flex-1 overflow-y-auto">
                <RelationshipCard rel={selected} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
