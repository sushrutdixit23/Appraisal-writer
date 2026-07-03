"use client";
export const dynamic = "force-dynamic";

import ZyntaskLoader from "../components/ZyntaskLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import SiteNav from "../components/SiteNav";

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

  if (loading) return <main className="min-h-screen bg-mist flex items-center justify-center"><ZyntaskLoader /></main>;

  return (
    <main className="min-h-screen bg-mist">
      <SiteNav />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Content calendar</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink">Your LinkedIn posts</h1>
          </div>
          <a href="/dashboard" className="text-[13px] text-slate hover:text-indigo transition-colors">Back to dashboard</a>
        </div>

        {/* Scheduled posts */}
        {posts.filter(p => p.scheduled_at && p.status === "pending").length > 0 && (
          <div className="mb-8">
            <h2 className="font-display font-semibold text-[18px] text-ink mb-4">Scheduled</h2>
            <div className="space-y-3">
              {posts.filter(p => p.scheduled_at && p.status === "pending").map(post => (
                <div key={post.id} className="bg-cloud border border-indigo/20 rounded-[16px] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo bg-indigo/10 border border-indigo/20 px-2 py-0.5 rounded-full">Scheduled</span>
                      <span className="text-[11px] text-slate">{new Date(post.scheduled_at!).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {new Date(post.scheduled_at!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <button onClick={() => archivePost(post.id)} className="text-[11px] text-slate-light hover:text-rose transition-colors">Remove</button>
                  </div>
                  <p className="text-[14px] font-semibold text-ink mb-1">{post.text}</p>
                  <p className="text-[12.5px] text-slate leading-relaxed mb-4 line-clamp-2">{post.reply}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-[11px] text-slate font-medium">Reschedule:</p>
                    {bestTimes.map((t, i) => (
                      <button key={i} onClick={() => reschedulePost(post.id, t.toISOString())} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg border border-line text-slate hover:border-indigo/30 hover:text-indigo transition-colors">
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
          <div className="bg-cloud border border-line rounded-[20px] p-5 mb-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo mb-1">Best times to post this week</p>
            <p className="text-[12px] text-slate mb-3">Your audience is most active Tuesday to Thursday, morning and early evening. The first hour after posting matters most for reach, so a good time to post is a good time to also check back in.</p>
            <div className="flex gap-3 flex-wrap">
              {bestTimes.map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-mist border border-line rounded-xl px-4 py-2">
                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-indigo stroke-[2] fill-none" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>
                  <span className="text-[13px] font-medium text-ink">{t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWeekOffset(w => w - 1)} className="text-[13px] text-slate hover:text-indigo transition-colors flex items-center gap-1">
            <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M13 16l-6-6 6-6"/></svg>Prev week
          </button>
          <span className="text-[13px] font-semibold text-ink">
            {weekDays[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} to {weekDays[6].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="text-[13px] text-slate hover:text-indigo transition-colors flex items-center gap-1">
            Next week<svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-8">
          {weekDays.map((day, i) => {
            const dayPosts = getPostsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className={`min-h-[120px] rounded-[16px] border p-3 ${isToday ? "border-indigo/40 bg-indigo/5" : "border-line bg-cloud"}`}>
                <p className={`text-[11px] font-bold mb-2 ${isToday ? "text-indigo" : "text-slate"}`}>{formatDate(day)}</p>
                {dayPosts.length === 0 ? (
                  <p className="text-[10px] text-slate-light italic">Empty</p>
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
            <h2 className="font-display font-semibold text-[18px] text-ink mb-4">Unscheduled drafts</h2>
            <div className="space-y-3">
              {unscheduled.map(post => (
                <div key={post.id} className="bg-cloud border border-line rounded-[16px] p-5">
                  <p className="text-[14px] font-semibold text-ink mb-1">{post.text}</p>
                  <p className="text-[12.5px] text-slate leading-relaxed mb-4 line-clamp-2">{post.reply}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-[11px] text-slate">Schedule for:</p>
                    {bestTimes.map((t, i) => (
                      <button key={i} onClick={() => schedulePost(post.id, t.toISOString())} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg border border-indigo/30 text-indigo hover:bg-indigo/5 transition-colors">
                        {t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })} {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </button>
                    ))}
                    <a href="/dashboard" className="text-[11.5px] text-slate hover:text-indigo transition-colors">Edit first</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {published.length > 0 && (
          <div>
            <h2 className="font-display font-semibold text-[18px] text-ink mb-4">Published</h2>
            <div className="space-y-3">
              {published.map(post => (
                <div key={post.id} className="bg-cloud border border-line rounded-[16px] p-5 opacity-75">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Published</span>
                    <span className="text-[11px] text-slate">{new Date(post.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <p className="text-[13px] text-ink-soft leading-relaxed line-clamp-3">{post.reply}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {posts.length === 0 && (
          <div className="text-center py-20">
            <p className="font-serif text-[22px] text-ink mb-2">No posts yet.</p>
            <p className="text-slate text-[14px] mb-6">Draft your first LinkedIn post from the dashboard.</p>
            <a href="/dashboard" className="inline-flex px-6 py-3 rounded-[13px] text-[14px] font-semibold text-white" style={{ background: ACCENT }}>Go to dashboard</a>
          </div>
        )}
      </div>
    </main>
  );
}
