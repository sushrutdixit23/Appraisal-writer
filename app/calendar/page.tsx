"use client";
export const dynamic = "force-dynamic";

import ZyntaskLoader from "../components/ZyntaskLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Post = {
  id: string;
  text: string;
  reply: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  type: string;
};

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

function getWeekDays(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay() + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

export default function CalendarPage() {
  const router = useRouter();

  const archivePost = async (postId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/delete-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: postId }),
    });
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const reschedulePost = async (postId: string, scheduledAt: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/schedule-post", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: postId, scheduled_at: scheduledAt }),
    });
    if (res.ok) setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_at: scheduledAt } : p));
  };

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(baseDate);

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/"); return; }
      const { data: clientRow } = await supabase.from("clients").select("id").eq("auth_user_id", sessionData.session.user.id).single();
      if (!clientRow) { setLoading(false); return; }
      const { data } = await supabase.from("interactions").select("id, text, reply, status, created_at, scheduled_at, type").eq("client_id", clientRow.id).eq("type", "post_draft").order("created_at", { ascending: false });
      setPosts((data as Post[]) || []);
      setLoading(false);
    };
    load();
  }, [router]);

  const getBestTimes = () => {
    const now = new Date();
    const slots = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const day = d.getDay();
      if (day >= 1 && day <= 4) {
        const morning = new Date(d); morning.setHours(8,0,0,0);
        if (morning > now) slots.push(morning);
        const evening = new Date(d); evening.setHours(17,30,0,0);
        if (evening > now) slots.push(evening);
      }
    }
    return slots.slice(0, 3);
  };

  const schedulePost = async (postId: string, scheduledAt: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/schedule-post", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: postId, scheduled_at: scheduledAt }),
    });
    if (res.ok) setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_at: scheduledAt } : p));
  };

  const getPostsForDay = (day: Date) => posts.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day));
  const unscheduled = posts.filter(p => !p.scheduled_at && p.status === "pending");
  const published = posts.filter(p => p.status === "sent");
  const bestTimes = getBestTimes();

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

  return (
    <main className="relative min-h-screen bg-ink overflow-x-hidden font-display">
      <div className="aurora-page-dark" />
      <div className="relative z-10">

        <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: "linear-gradient(180deg, rgba(20,23,42,0.55) 0%, rgba(15,17,30,0.25) 70%, rgba(15,17,30,0) 100%)" }}>
          <div className="max-w-6xl mx-auto px-4 md:px-8 h-[62px] md:h-[72px] flex items-center justify-between gap-6">
            <span className="relative font-serif font-semibold text-2xl md:text-3xl text-white tracking-tight flex items-center gap-2.5">
              Engage<span style={{ color: "#8a6ff0" }}>.</span>
            </span>
            <a href="/dashboard" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Back to dashboard</a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-8 pb-20">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Content calendar</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-white">Your LinkedIn posts</h1>
          </div>

          {posts.filter(p => p.scheduled_at && p.status === "pending").length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-[18px] text-white mb-4">Scheduled</h2>
              <div className="space-y-3">
                {posts.filter(p => p.scheduled_at && p.status === "pending").map(post => (
                  <div key={post.id} className="rounded-[16px] p-5 border border-indigo/25" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#B5ACFF] bg-indigo/15 border border-indigo/30 px-2 py-0.5 rounded-full">Scheduled</span>
                        <span className="text-[11px] text-slate-light">{new Date(post.scheduled_at!).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {new Date(post.scheduled_at!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <button onClick={() => archivePost(post.id)} className="text-[11px] text-slate-light hover:text-rose transition-colors">Remove</button>
                    </div>
                    <p className="text-[14px] font-semibold text-white mb-1">{post.text}</p>
                    <p className="text-[12.5px] text-slate-light leading-relaxed mb-4 line-clamp-2">{post.reply}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-[11px] text-slate-light font-medium">Reschedule:</p>
                      {bestTimes.map((t, i) => (
                        <button key={i} onClick={() => reschedulePost(post.id, t.toISOString())} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg border border-white/15 text-slate-light hover:border-indigo/40 hover:text-white transition-colors">
                          {t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })} {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unscheduled.length > 0 && bestTimes.length > 0 && (
            <div className="rounded-[20px] p-5 mb-6 border border-white/[0.10]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo mb-1">Best times to post this week</p>
              <p className="text-[12px] text-slate-light mb-3">Your audience is most active Tuesday to Thursday, morning and early evening. The first hour after posting matters most for reach, so a good time to post is a good time to also check back in.</p>
              <div className="flex gap-3 flex-wrap">
                {bestTimes.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl px-4 py-2 border border-white/15" style={{ background: "rgba(0,0,0,0.20)" }}>
                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-indigo stroke-[2] fill-none" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>
                    <span className="text-[13px] font-medium text-white">{t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setWeekOffset(w => w - 1)} className="text-[13px] text-slate-light hover:text-white transition-colors flex items-center gap-1">
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M13 16l-6-6 6-6"/></svg>Prev week
            </button>
            <span className="text-[13px] font-semibold text-white">
              {weekDays[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} to {weekDays[6].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="text-[13px] text-slate-light hover:text-white transition-colors flex items-center gap-1">
              Next week<svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-8">
            {weekDays.map((day, i) => {
              const dayPosts = getPostsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i} className="min-h-[120px] rounded-[16px] border p-3" style={isToday ? { borderColor: "rgba(122,108,255,0.4)", background: "rgba(122,108,255,0.08)" } : { borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
                  <p className={`text-[11px] font-bold mb-2 ${isToday ? "text-indigo" : "text-slate-light"}`}>{formatDate(day)}</p>
                  {dayPosts.length === 0 ? (
                    <p className="text-[10px] text-slate-light/60 italic">Empty</p>
                  ) : dayPosts.map(p => (
                    <div key={p.id} className="rounded-lg px-2 py-1.5 mb-1.5 text-[10.5px] font-medium text-white" style={{ background: ACCENT }}>
                      {p.text.slice(0, 25)}{p.text.length > 25 ? "..." : ""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {unscheduled.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-[18px] text-white mb-4">Unscheduled drafts</h2>
              <div className="space-y-3">
                {unscheduled.map(post => (
                  <div key={post.id} className="rounded-[16px] p-5 border border-white/[0.10]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)" }}>
                    <p className="text-[14px] font-semibold text-white mb-1">{post.text}</p>
                    <p className="text-[12.5px] text-slate-light leading-relaxed mb-4 line-clamp-2">{post.reply}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-[11px] text-slate-light">Schedule for:</p>
                      {bestTimes.map((t, i) => (
                        <button key={i} onClick={() => schedulePost(post.id, t.toISOString())} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg border border-indigo/30 text-indigo hover:bg-indigo/10 transition-colors">
                          {t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })} {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                      <a href="/dashboard" className="text-[11.5px] text-slate-light hover:text-white transition-colors">Edit first</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {published.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-[18px] text-white mb-4">Published</h2>
              <div className="space-y-3">
                {published.map(post => (
                  <div key={post.id} className="rounded-[16px] p-5 border border-white/[0.10] opacity-75" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-500/10 border border-green-500/25 px-2 py-0.5 rounded-full">Published</span>
                      <span className="text-[11px] text-slate-light">{new Date(post.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <p className="text-[13px] text-slate-light leading-relaxed line-clamp-3">{post.reply}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {posts.length === 0 && (
            <div className="text-center py-20">
              <p className="font-serif text-[22px] text-white mb-2">No posts yet.</p>
              <p className="text-slate-light text-[14px] mb-6">Draft your first LinkedIn post from the dashboard.</p>
              <a href="/dashboard" className="inline-flex px-6 py-3 rounded-[13px] text-[14px] font-semibold text-white" style={{ background: ACCENT }}>Go to dashboard</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
