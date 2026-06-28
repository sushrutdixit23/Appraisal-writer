"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Interaction = {
  id: string;
  client_id: string;
  type: string;
  name: string;
  role: string;
  post: string | null;
  text: string;
  classification: string;
  intent: string;
  reasoning: string | null;
  confidence: number;
  requires_human: boolean;
  suggested_action: string | null;
  reply: string;
  status: string;
  created_at: string;
  temperature: string | null;
  temperature_reason: string | null;
};

type FilterType = "all" | "dm" | "comment";
type ViewTab = "pending" | "sent" | "skipped" | "posts";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

const TAB_LABELS: Record<ViewTab, string> = {
  pending: "Pending",
  sent: "Sent",
  skipped: "Skipped",
  posts: "Posts",
};

const EMPTY_COPY: Record<ViewTab, { title: string; body: string }> = {
  pending: { title: "Queue clear.", body: "Nothing pending review right now." },
  sent: { title: "Nothing sent yet.", body: "Replies you approve will show up here." },
  skipped: { title: "Nothing skipped.", body: "Messages you skip will show up here." },
  posts: { title: "No posts yet.", body: "Draft your first LinkedIn post using the button above." },
};

function TempDot({ temp }: { temp: string | null }) {
  if (!temp) return null;
  const color = temp === "hot" ? "#FF4444" : temp === "warm" ? "#F5A623" : "#4A9EFF";
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 5, flexShrink: 0, marginTop: 3 }} />;
}

// DetailPanel defined OUTSIDE Dashboard to prevent re-mount on every render
function DetailPanel({
  item, drafts, setDrafts, busyId, handleApprove, handleSkip, handlePublishPost, view
}: {
  item: Interaction;
  drafts: Record<string, string>;
  setDrafts: (d: Record<string, string>) => void;
  busyId: string | null;
  handleApprove: (item: Interaction) => void;
  handleSkip: (item: Interaction) => void;
  handlePublishPost: (item: Interaction) => void;
  view: string;
}) {
  const isPost = item.type === "post_draft";
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-base flex-shrink-0 text-white" style={{ background: ACCENT }}>
            {item.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white">{item.name}</p>
            <p className="text-[12.5px] text-slate-light">{item.role}</p>
          </div>
        </div>
        <span className="text-[12px] text-slate-light pt-1">{formatTime(item.created_at)}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {item.post && (
          <div className="text-[12.5px] text-slate-light bg-black/20 border border-white/10 rounded-xl px-4 py-3 leading-relaxed">
            On: {item.post}
          </div>
        )}

        <div className="text-[14.5px] text-white/90 bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 leading-relaxed">
          {item.text}
        </div>

        {!isPost && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Classified</p>
              <p className="text-[13px] font-semibold" style={{ color: "#5B9BFF" }}>{item.classification}</p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Intent</p>
              <p className="text-[13px] font-medium text-white truncate">{item.intent || "-"}</p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Confidence</p>
              <p className="text-[13px] font-mono text-white">{item.confidence != null ? `${item.confidence}%` : "-"}</p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Routing</p>
              <span className={`text-[11px] font-bold uppercase tracking-wide ${item.requires_human ? "text-amber" : "text-green-400"}`}>
                {item.requires_human ? "Needs you" : "Safe to auto"}
              </span>
            </div>
          </div>
        )}

        {item.reasoning && !isPost && (
          <div className="bg-black/20 border border-white/10 rounded-lg px-3.5 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-1">Why this classification</p>
            <p className="text-[12.5px] text-white/80 leading-relaxed">{item.reasoning}</p>
          </div>
        )}

        {item.temperature && !isPost && (
          <div className="rounded-lg px-3.5 py-3 border" style={{
            background: item.temperature === "hot" ? "rgba(255,68,68,0.08)" : item.temperature === "warm" ? "rgba(245,166,35,0.08)" : "rgba(74,158,255,0.08)",
            borderColor: item.temperature === "hot" ? "rgba(255,68,68,0.25)" : item.temperature === "warm" ? "rgba(245,166,35,0.25)" : "rgba(74,158,255,0.25)"
          }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: item.temperature === "hot" ? "#FF4444" : item.temperature === "warm" ? "#F5A623" : "#4A9EFF" }}>
              {item.temperature === "hot" ? "Hot lead" : item.temperature === "warm" ? "Warm lead" : "Cold"} · Lead temperature
            </p>
            <p className="text-[12.5px] text-white/80 leading-relaxed">{item.temperature_reason}</p>
          </div>
        )}

        {item.suggested_action && !isPost && (
          <div className="rounded-lg px-3.5 py-3 border" style={{ background: "rgba(91,75,255,0.08)", borderColor: "rgba(91,75,255,0.25)" }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#8a6ff0" }}>Suggested next step</p>
            <p className="text-[12.5px] text-white/85 leading-relaxed">{item.suggested_action}</p>
          </div>
        )}

        {view === "sent" && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light mb-2">{isPost ? "Post published" : "Reply sent"}</p>
            <div className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 text-[14.5px] text-white/90 leading-relaxed whitespace-pre-wrap">
              {item.reply || "-"}
            </div>
          </div>
        )}

        {view === "skipped" && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light mb-2">Skipped</p>
            <p className="text-slate-light text-sm">This message was skipped. No reply was sent.</p>
          </div>
        )}
      </div>

      {(view === "pending" || view === "posts") && (
        <div className="pt-3 border-t border-white/10 mt-3 space-y-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light">
            {isPost ? "Review your draft" : "Reply"}
          </p>
          <textarea
            key={item.id + "-reply"}
            value={drafts[item.id] ?? ""}
            onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value })}
            rows={isPost ? 10 : 4}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-[14.5px] text-white resize-y focus:outline-none focus:border-white/25"
          />
          <div className="flex gap-2.5">
            {!isPost && (
              <button
                onClick={() => handleSkip(item)}
                disabled={busyId === item.id}
                className="flex-1 py-3 text-[14px] border border-white/15 rounded-xl text-white hover:border-white/30 disabled:opacity-50"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => isPost ? handlePublishPost(item) : handleApprove(item)}
              disabled={busyId === item.id}
              className={`py-3 text-[14px] font-medium text-white rounded-xl shadow-[0_6px_18px_rgba(10,102,194,0.35)] hover:opacity-90 disabled:opacity-50 ${isPost ? "w-full" : "flex-[2]"}`}
              style={{ background: ACCENT }}
            >
              {busyId === item.id ? (isPost ? "Publishing..." : "Sending...") : (isPost ? "Publish to LinkedIn" : "Approve & send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Interaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [sentToday, setSentToday] = useState(0);
  const [dailyCap, setDailyCap] = useState(100);
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [view, setView] = useState<ViewTab>("pending");
  const [linkedinConnected, setLinkedinConnected] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [postTopic, setPostTopic] = useState("");
  const [postNotes, setPostNotes] = useState("");
  const [draftingPost, setDraftingPost] = useState(false);

  const loadMeta = async (clientId: string) => {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("daily_cap, unipile_account_id")
      .eq("id", clientId)
      .single();
    if (clientRow) {
      setDailyCap(clientRow.daily_cap);
      setLinkedinConnected(Boolean(clientRow.unipile_account_id));
    }
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("send_log")
      .select("id", { count: "exact" })
      .eq("client_id", clientId)
      .gte("sent_at", todayStart.toISOString());
    setSentToday(count ?? 0);
  };

  const loadQueue = async (clientId: string, status: ViewTab) => {
    const { data } = await supabase
      .from("interactions")
      .select("*")
      .eq("client_id", clientId)
      .eq("status", status === "posts" ? "pending" : status)
      .order("created_at", { ascending: false });

    let filtered = data ?? [];
    if (status === "posts") {
      filtered = filtered.filter(i => i.type === "post_draft");
    } else {
      filtered = filtered.filter(i => i.type !== "post_draft");
    }

    setItems(filtered as Interaction[]);
    const initialDrafts: Record<string, string> = {};
    filtered.forEach((item: Interaction) => { initialDrafts[item.id] = item.reply || ""; });
    setDrafts((prev) => ({ ...prev, ...initialDrafts }));
    setSelectedId((prev) => (filtered.find((i) => i.id === prev) ? prev : filtered[0]?.id ?? null));
  };

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/"); return; }
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id, status, trial_ends_at")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();
      if (clientRow) {
        if (clientRow.status === "trial" && clientRow.trial_ends_at) {
          const expired = new Date(clientRow.trial_ends_at) < new Date();
          if (expired) { router.replace("/onboard?expired=1"); return; }
        }
        setMyClientId(clientRow.id);
        await loadMeta(clientRow.id);
        await loadQueue(clientRow.id, "pending");
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const handleTabChange = async (tab: ViewTab) => {
    setView(tab);
    setClassFilter("all");
    if (myClientId) await loadQueue(myClientId, tab);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleApprove = async (item: Interaction) => {
    const text = drafts[item.id]?.trim();
    if (!text) { showToast("Write a reply before approving."); return; }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, client_id: item.client_id, text }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Failed to send."); return; }
      showToast("Sent.");
      setSheetOpen(false);
      if (myClientId) { await loadMeta(myClientId); await loadQueue(myClientId, view); }
    } catch { showToast("Could not reach the server."); }
    finally { setBusyId(null); }
  };

  const handleSkip = async (item: Interaction) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, client_id: item.client_id }),
      });
      if (!res.ok) { showToast("Failed to skip."); return; }
      showToast("Skipped.");
      setSheetOpen(false);
      if (myClientId) { await loadMeta(myClientId); await loadQueue(myClientId, view); }
    } catch { showToast("Could not reach the server."); }
    finally { setBusyId(null); }
  };

  const handlePublishPost = async (item: Interaction) => {
    const text = drafts[item.id]?.trim();
    if (!text) { showToast("Write something before publishing."); return; }
    setBusyId(item.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: item.id, text }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Failed to publish."); return; }
      showToast("Published to LinkedIn.");
      setSheetOpen(false);
      if (myClientId) await loadQueue(myClientId, "posts");
    } catch { showToast("Could not reach the server."); }
    finally { setBusyId(null); }
  };

  const handleDraftPost = async () => {
    if (!postTopic.trim()) { showToast("Enter a topic first."); return; }
    setDraftingPost(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/draft-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ topic: postTopic, notes: postNotes }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Failed to draft post."); return; }
      showToast("Post drafted.");
      setDraftModalOpen(false);
      setPostTopic("");
      setPostNotes("");
      await handleTabChange("posts");
    } catch { showToast("Could not reach the server."); }
    finally { setDraftingPost(false); }
  };

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <p className="text-slate-light text-sm">Loading...</p>
      </main>
    );
  }

  const classifications = Array.from(new Set(items.map((i) => i.classification).filter(Boolean)));
  let visibleItems = items;
  if (filter !== "all" && view !== "posts") visibleItems = visibleItems.filter((i) => i.type === filter);
  if (classFilter !== "all") visibleItems = visibleItems.filter((i) => i.classification === classFilter);
  const tempOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  visibleItems = [...visibleItems].sort((a, b) => {
    if (view !== "pending") return 0;
    return (tempOrder[a.temperature ?? "cold"] ?? 2) - (tempOrder[b.temperature ?? "cold"] ?? 2);
  });
  visibleItems = [...visibleItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const selected = items.find((i) => i.id === selectedId);
  const capPct = Math.min(100, (sentToday / dailyCap) * 100);
  const emptyCopy = EMPTY_COPY[view];

  return (
    <main className="min-h-screen bg-ink">
      <style jsx global>{`select option { background-color: #1a1d29; color: #ffffff; }`}</style>

      {/* Header */}
      <div className="bg-ink border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 md:px-7 h-[60px] md:h-[68px] flex items-center justify-between gap-4">
          <span className="font-serif font-semibold text-xl md:text-2xl text-white tracking-tight">
            Engage<span style={{ color: "#8a6ff0" }}>.</span>
          </span>
          <div className="flex items-center gap-3 md:gap-6">
            <div className="flex items-center gap-2 text-[11px] md:text-[12.5px] text-slate-light">
              <span className="hidden sm:inline">Sent today</span>
              <div className="w-16 md:w-24 h-[5px] md:h-[6px] bg-white/10 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${capPct}%`, background: ACCENT }} />
              </div>
              <span className="font-mono text-white">{sentToday}/{dailyCap}</span>
            </div>
            <a href="/welcome" className="text-[11px] md:text-[12.5px] text-slate-light hover:text-white transition-colors whitespace-nowrap">Back to home</a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-7 py-5 md:py-10">
        {!linkedinConnected ? (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-12 text-center">
            <p className="font-serif text-2xl text-white mb-2">Setting up your LinkedIn connection.</p>
            <p className="text-slate-light text-sm max-w-md mx-auto leading-relaxed">
              We are finishing setup on our end. This usually takes under 24 hours.
            </p>
          </div>
        ) : (
          <div className="md:grid md:grid-cols-[320px_1fr] md:gap-6">
            {/* Left panel */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-4 md:px-5 py-4 border-b border-white/10 space-y-3">
                {/* View tabs */}
                <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                  {(["pending", "sent", "skipped", "posts"] as ViewTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(tab)}
                      className="flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all"
                      style={view === tab ? { background: ACCENT, color: "#fff" } : { color: "#9b95a8" }}
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>

                {/* Draft a post button - only in Posts tab */}
                {view === "posts" && (
                  <button
                    onClick={() => setDraftModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold py-2.5 rounded-lg text-white hover:opacity-90 transition-all"
                    style={{ background: ACCENT }}
                  >
                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-current stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 4v12M4 10h12" />
                    </svg>
                    Draft a post
                  </button>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-light">{TAB_LABELS[view]}</span>
                  <span className="text-[11px] font-mono text-slate-light">{visibleItems.length} of {items.length}</span>
                </div>

                {view !== "posts" && (
                  <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                    {(["all", "dm", "comment"] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className="flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all"
                        style={filter === f ? { background: ACCENT, color: "#fff" } : { color: "#9b95a8" }}
                      >
                        {f === "all" ? "All" : f === "dm" ? "DMs" : "Comments"}
                      </button>
                    ))}
                  </div>
                )}

                {classifications.length > 0 && view !== "posts" && (
                  <div className="relative">
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="w-full appearance-none text-[11.5px] bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 text-white"
                    >
                      <option value="all">All types</option>
                      {classifications.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-slate-light" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Item list */}
              {visibleItems.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13px] text-slate-light">
                  {items.length === 0 ? emptyCopy.body : "Nothing matches this filter."}
                </div>
              ) : (
                visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item.id)}
                    className="w-full text-left px-4 md:px-5 py-4 border-b border-white/10 last:border-0 transition-colors active:bg-white/5"
                    style={item.id === selectedId ? { background: "rgba(255,255,255,0.06)", borderLeft: "3px solid #5B4BFF" } : { borderLeft: "3px solid transparent" }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white px-2 py-1 rounded-md flex-shrink-0">
                          {item.type === "post_draft" ? "Post" : item.type === "dm" ? "DM" : "Comment"}
                        </span>
                        <span className="text-[14px] font-semibold text-white truncate flex items-center">
                          <TempDot temp={item.temperature} />
                          {item.type === "post_draft" ? item.text.slice(0, 40) + "..." : item.name}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-light flex-shrink-0">{formatTime(item.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-slate-light leading-relaxed truncate">
                      {item.type === "post_draft" ? item.reply?.slice(0, 80) + "..." : item.text}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Right panel — desktop */}
            <div className="hidden md:block">
              {items.length === 0 ? (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-12 text-center">
                  <p className="font-serif text-2xl text-white mb-2">{emptyCopy.title}</p>
                  <p className="text-slate-light text-sm">{emptyCopy.body}</p>
                </div>
              ) : selected ? (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
                  <DetailPanel item={selected} drafts={drafts} setDrafts={setDrafts} busyId={busyId} handleApprove={handleApprove} handleSkip={handleSkip} handlePublishPost={handlePublishPost} view={view} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && selected && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="relative bg-[#13151f] border-t border-white/10 rounded-t-[24px] max-h-[90vh] flex flex-col px-5 pt-4 pb-8">
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <button onClick={() => setSheetOpen(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white">
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round">
                <path d="M5 5l10 10M15 5l-10 10" />
              </svg>
            </button>
            <div className="flex-1 overflow-y-auto">
              <DetailPanel item={selected} drafts={drafts} setDrafts={setDrafts} busyId={busyId} handleApprove={handleApprove} handleSkip={handleSkip} handlePublishPost={handlePublishPost} view={view} />
            </div>
          </div>
        </div>
      )}

      {/* Draft Post Modal */}
      {draftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDraftModalOpen(false)} />
          <div className="relative bg-[#13151f] border border-white/10 rounded-[24px] p-7 w-full max-w-lg">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-light mb-1">Draft a LinkedIn post</p>
            <h3 className="font-serif font-semibold text-[22px] text-white mb-5">What do you want to post about?</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Topic</p>
                <input
                  type="text"
                  value={postTopic}
                  onChange={e => setPostTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleDraftPost(); }}
                  placeholder="e.g. What I learned building Zyntask in 2 weeks"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder-slate-light focus:outline-none focus:border-white/25"
                />
              </div>
              <div>
                <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Key points <span className="normal-case opacity-60">(optional)</span></p>
                <textarea
                  value={postNotes}
                  onChange={e => setPostNotes(e.target.value)}
                  rows={3}
                  placeholder="Any specific angles, stats, or details to include..."
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder-slate-light resize-none focus:outline-none focus:border-white/25"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDraftModalOpen(false)} className="flex-1 py-3 text-[14px] border border-white/15 rounded-xl text-white hover:border-white/30">Cancel</button>
              <button onClick={handleDraftPost} disabled={draftingPost} className="flex-[2] py-3 text-[14px] font-medium text-white rounded-xl disabled:opacity-50" style={{ background: ACCENT }}>
                {draftingPost ? "Drafting..." : "Draft post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-xl text-sm shadow-xl z-[60]">
          {toast}
        </div>
      )}
    </main>
  );
}
