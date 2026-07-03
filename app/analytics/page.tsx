"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

type Stats = {
  sentThisWeek: number;
  hotLeadsEngaged: number;
  responseRate: number;
  skipRate: number;
  postsPublished: number;
  totalSent: number;
  totalSkipped: number;
  totalPending: number;
  classifications: Record<string, number>;
  dailyActivity: { day: string; count: number }[];
  wins: { outcome_value: string; outcome_marked_at: string; name: string }[];
};

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-cloud border border-line rounded-[20px] p-6">
      <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-3">{label}</p>
      <p className="font-display font-bold text-[36px] tracking-tight text-ink leading-none mb-1" style={color ? { color } : {}}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-slate">{sub}</p>}
    </div>
  );
}

function Bar({ count, max, day }: { count: number; max: number; day: string }) {
  const pct = max === 0 ? 0 : Math.max(4, (count / max) * 100);
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <span className="text-[11px] font-mono text-slate">{count}</span>
      <div className="w-full bg-line rounded-full overflow-hidden" style={{ height: 80 }}>
        <div className="w-full rounded-full transition-all duration-500" style={{ height: `${pct}%`, background: ACCENT, marginTop: `${100-pct}%` }} />
      </div>
      <span className="text-[10px] text-slate">{day}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/"); return; }

      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();
      if (!clientRow) { setLoading(false); return; }
      setClientId(clientRow.id);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      // Wins / outcomes
      const { data: winsData } = await supabase
        .from("interactions")
        .select("outcome, outcome_value, outcome_marked_at, name")
        .eq("client_id", clientRow.id)
        .eq("outcome", "win")
        .order("outcome_marked_at", { ascending: false });
      const wins = winsData || [];


      // Sent this week
      const { count: sentThisWeek } = await supabase
        .from("send_log")
        .select("id", { count: "exact" })
        .eq("client_id", clientRow.id)
        .gte("sent_at", sevenDaysAgoISO);

      // All interactions
      const { data: allInteractions } = await supabase
        .from("interactions")
        .select("status, temperature, classification, created_at, type")
        .eq("client_id", clientRow.id);

      const interactions = allInteractions || [];
      const replies = interactions.filter(i => i.type !== "post_draft");
      const posts = interactions.filter(i => i.type === "post_draft");

      const sent = replies.filter(i => i.status === "sent").length;
      const skipped = replies.filter(i => i.status === "skipped").length;
      const pending = replies.filter(i => i.status === "pending").length;
      const total = sent + skipped;

      const hotLeadsEngaged = replies.filter(i => i.temperature === "hot" && i.status === "sent").length;
      const postsPublished = posts.filter(i => i.status === "sent").length;
      const responseRate = total === 0 ? 0 : Math.round((sent / total) * 100);
      const skipRate = total === 0 ? 0 : Math.round((skipped / total) * 100);

      // Classification breakdown
      const classifications: Record<string, number> = {};
      replies.forEach(i => {
        if (i.classification) {
          classifications[i.classification] = (classifications[i.classification] || 0) + 1;
        }
      });

      // Daily activity for past 7 days
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const dailyActivity = days.map(d => {
        const dayStr = d.toLocaleDateString("en-IN", { weekday: "short" });
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        const count = replies.filter(i => {
          const t = new Date(i.created_at);
          return t >= start && t <= end;
        }).length;
        return { day: dayStr, count };
      });

      setStats({
        sentThisWeek: sentThisWeek || 0,
        hotLeadsEngaged,
        responseRate,
        skipRate,
        postsPublished,
        totalSent: sent,
        totalSkipped: skipped,
        totalPending: pending,
        classifications,
        dailyActivity,
        wins,
      });
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading) return (
    <main className="min-h-screen bg-mist flex items-center justify-center">
      <p className="text-slate text-sm">Loading analytics...</p>
    </main>
  );

  if (!stats) return (
    <main className="min-h-screen bg-mist flex items-center justify-center">
      <p className="text-slate text-sm">No data yet.</p>
    </main>
  );

  const maxDaily = Math.max(...stats.dailyActivity.map(d => d.count), 1);
  const topClassifications = Object.entries(stats.classifications)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 6);
  const totalClassified = topClassifications.reduce((s,[,v]) => s+v, 0);

  return (
    <main className="min-h-screen bg-mist">
      <SiteNav />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-20">

        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Engage analytics</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink">What Engage has helped you achieve</h1>
          </div>
          <a href="/dashboard" className="text-[13px] text-slate hover:text-indigo transition-colors">Back to dashboard</a>
        </div>

        {/* Outcomes - leads the page */}
        <div className="bg-cloud border border-line rounded-[20px] p-6 mb-8" style={{ background: stats.wins.length > 0 ? "linear-gradient(150deg, rgba(31,191,117,0.06), rgba(31,191,117,0.01))" : undefined }}>
          <div className="flex items-center justify-between mb-5">
            <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate">Business outcomes</p>
            {stats.wins.length > 0 && (
              <span className="text-[12px] font-bold text-green-600 bg-green-50 border border-green-200 px-3 py-1 rounded-full">{stats.wins.length} win{stats.wins.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {stats.wins.length > 0 ? (
            <div className="space-y-3">
              {stats.wins.map((w, i) => (
                <div key={i} className="flex items-start justify-between gap-4 py-3 border-b border-line last:border-0">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{w.outcome_value}</p>
                    <p className="text-[11px] text-slate mt-0.5">from conversation with {w.name}</p>
                  </div>
                  <span className="text-[11px] text-slate flex-shrink-0">{new Date(w.outcome_marked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-slate leading-relaxed">No wins recorded yet. When a conversation turns into a meeting, a client, or something real, mark it as a win from your dashboard. This is where the real value of Engage shows up, not in reply counts.</p>
          )}
        </div>

        {/* Activity - supporting detail */}
        <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-3">Activity</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <MetricCard label="Sent this week" value={stats.sentThisWeek} sub="LinkedIn replies dispatched" />
          <MetricCard label="Hot leads engaged" value={stats.hotLeadsEngaged} sub="High-priority conversations" color="#FF4444" />
          <MetricCard label="Response rate" value={stats.responseRate + "%"} sub={`${stats.totalSent} sent, ${stats.totalSkipped} skipped`} color="#5B4BFF" />
          <MetricCard label="Skip rate" value={stats.skipRate + "%"} sub="Messages you passed on" />
          <MetricCard label="Posts published" value={stats.postsPublished} sub="LinkedIn posts via Engage" />
          <MetricCard label="In queue" value={stats.totalPending} sub="Waiting for your review" />
        </div>

        {/* Daily activity chart */}
        <div className="bg-cloud border border-line rounded-[20px] p-6 mb-6">
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-6">Activity this week</p>
          <div className="flex gap-3 items-end" style={{ height: 120 }}>
            {stats.dailyActivity.map((d, i) => (
              <Bar key={i} count={d.count} max={maxDaily} day={d.day} />
            ))}
          </div>
        </div>

        {/* Classification breakdown */}
        {topClassifications.length > 0 && (
          <div className="bg-cloud border border-line rounded-[20px] p-6">
            <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-5">What people are saying</p>
            <div className="space-y-3">
              {topClassifications.map(([label, count]) => {
                const pct = totalClassified === 0 ? 0 : Math.round((count / totalClassified) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-ink capitalize">{label}</span>
                      <span className="text-[12px] font-mono text-slate">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-line rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: pct + "%", background: ACCENT }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {stats.totalSent === 0 && stats.sentThisWeek === 0 && (
          <div className="text-center py-10 mt-6">
            <p className="font-serif text-[20px] text-ink mb-2">No activity yet.</p>
            <p className="text-slate text-[14px]">Start approving replies in your dashboard to see analytics here.</p>
          </div>
        )}

      </div>
    </main>
  );
}
