"use client";

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
  confidence: number;
  requires_human: boolean;
  reply: string;
  status: string;
  created_at: string;
};

type FilterType = "all" | "dm" | "comment";
type ViewTab = "pending" | "sent" | "skipped";

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
};

const EMPTY_COPY: Record<ViewTab, { title: string; body: string }> = {
  pending: { title: "Queue clear.", body: "Nothing pending review right now." },
  sent: { title: "Nothing sent yet.", body: "Replies you approve will show up here." },
  skipped: { title: "Nothing skipped.", body: "Messages you skip will show up here." },
};

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
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (data) {
      setItems(data as Interaction[]);
      const initialDrafts: Record<string, string> = {};
      data.forEach((item: Interaction) => {
        initialDrafts[item.id] = item.reply || "";
      });
      setDrafts((prev) => ({ ...prev, ...initialDrafts }));
      setSelectedId((prev) => (data.find((i) => i.id === prev) ? prev : data[0]?.id ?? null));
    } else {
      setItems([]);
      setSelectedId(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/");
        return;
      }
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();

      if (clientRow) {
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleApprove = async (item: Interaction) => {
    const text = drafts[item.id]?.trim();
    if (!text) {
      showToast("Write a reply before approving.");
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, client_id: item.client_id, text }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "Failed to send.");
        return;
      }
      showToast("Sent.");
      if (myClientId) {
        await loadMeta(myClientId);
        await loadQueue(myClientId, view);
      }
    } catch {
      showToast("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (item: Interaction) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, client_id: item.client_id }),
      });
      if (!res.ok) {
        showToast("Failed to skip.");
        return;
      }
      showToast("Skipped.");
      if (myClientId) {
        await loadMeta(myClientId);
        await loadQueue(myClientId, view);
      }
    } catch {
      showToast("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
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
  if (filter !== "all") {
    visibleItems = visibleItems.filter((i) => i.type === filter);
  }
  if (classFilter !== "all") {
    visibleItems = visibleItems.filter((i) => i.classification === classFilter);
  }

  visibleItems = [...visibleItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const selected = items.find((i) => i.id === selectedId);
  const capPct = Math.min(100, (sentToday / dailyCap) * 100);
  const emptyCopy = EMPTY_COPY[view];

  return (
    <main className="min-h-screen bg-ink">
      <style jsx global>{`
        select option {
          background-color: #1a1d29;
          color: #ffffff;
        }
      `}</style>

      <div className="bg-ink border-b border-white/10">
        <div className="max-w-6xl mx-auto px-7 h-[68px] flex items-center justify-between">
          <span className="font-serif font-semibold text-2xl text-white tracking-tight">
            Engage<span style={{ color: "#8a6ff0" }}>.</span>
          </span>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-[12.5px] text-slate-light">
              <span>Sent today</span>
              <div className="w-24 h-[6px] bg-white/10 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${capPct}%`, background: ACCENT }} />
              </div>
              <span className="font-mono text-white">{sentToday} / {dailyCap}</span>
            </div>
            <button onClick={handleLogout} className="text-[12.5px] text-slate-light hover:text-white transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-7 py-10">
        {!linkedinConnected ? (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-12 text-center">
            <p className="font-serif text-2xl text-white mb-2">Setting up your LinkedIn connection.</p>
            <p className="text-slate-light text-sm max-w-md mx-auto leading-relaxed">
              We are finishing setup on our end. This usually takes under 24 hours. You will
              see your first replies here as soon as it is live.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[320px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 space-y-3">
                <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                  {(["pending", "sent", "skipped"] as ViewTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(tab)}
                      className="flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all"
                      style={
                        view === tab
                          ? { background: ACCENT, color: "#fff" }
                          : { color: "#9b95a8" }
                      }
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-light">
                    {TAB_LABELS[view]}
                  </span>
                  <span className="text-[11px] font-mono text-slate-light">
                    {visibleItems.length} of {items.length}
                  </span>
                </div>

                <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                  {(["all", "dm", "comment"] as FilterType[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className="flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all"
                      style={
                        filter === f
                          ? { background: ACCENT, color: "#fff" }
                          : { color: "#9b95a8" }
                      }
                    >
                      {f === "all" ? "All" : f === "dm" ? "DMs" : "Comments"}
                    </button>
                  ))}
                </div>

                {classifications.length > 0 && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="w-full appearance-none text-[11.5px] bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 text-white focus:outline-none focus:border-indigo cursor-pointer"
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
                  </div>
                )}
              </div>

              {visibleItems.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13px] text-slate-light">
                  {items.length === 0 ? emptyCopy.body : "Nothing matches this filter."}
                </div>
              ) : (
                visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="w-full text-left px-5 py-4 border-b border-white/10 last:border-0 transition-colors"
                    style={
                      item.id === selectedId
                        ? { background: "rgba(255,255,255,0.06)", borderLeft: "3px solid #5B4BFF" }
                        : { borderLeft: "3px solid transparent" }
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white px-2 py-1 rounded-md flex-shrink-0">
                          {item.type === "dm" ? "DM" : "Comment"}
                        </span>
                        <span className="text-[14px] font-semibold text-white truncate">{item.name}</span>
                      </div>
                      <span className="text-[10.5px] text-slate-light flex-shrink-0">{formatTime(item.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-slate-light leading-relaxed truncate">{item.text}</p>
                  </button>
                ))
              )}
            </div>

            {items.length === 0 ? (
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-12 text-center self-start">
                <p className="font-serif text-2xl text-white mb-2">{emptyCopy.title}</p>
                <p className="text-slate-light text-sm">{emptyCopy.body}</p>
              </div>
            ) : selected && (
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-base flex-shrink-0 text-white"
                      style={{ background: ACCENT }}
                    >
                      {selected.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{selected.name}</p>
                      <p className="text-[12.5px] text-slate-light">{selected.role}</p>
                    </div>
                  </div>
                  <span className="text-[12px] text-slate-light pt-1">{formatTime(selected.created_at)}</span>
                </div>

                {selected.post && (
                  <div className="text-[12.5px] text-slate-light mt-5 mb-3 bg-black/20 border border-white/10 rounded-xl px-4 py-3 leading-relaxed">
                    On: {selected.post}
                  </div>
                )}

                <div className="text-[14.5px] text-white/90 bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 mt-3 mb-5 leading-relaxed">
                  {selected.text}
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Classified</p>
                    <p className="text-[13px] font-semibold" style={{ color: "#5B9BFF" }}>{selected.classification}</p>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Intent</p>
                    <p className="text-[13px] font-medium text-white truncate">{selected.intent || "-"}</p>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Confidence</p>
                    <p className="text-[13px] font-mono text-white">{selected.confidence != null ? `${selected.confidence}%` : "-"}</p>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 flex flex-col">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-light mb-0.5">Routing</p>
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${selected.requires_human ? "text-amber" : "text-grass"}`}>
                      {selected.requires_human ? "Needs you" : "Safe to auto"}
                    </span>
                  </div>
                </div>

                {view === "pending" && (
                  <>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light mb-2">Reply</p>
                    <textarea
                      value={drafts[selected.id] ?? ""}
                      onChange={(e) => setDrafts({ ...drafts, [selected.id]: e.target.value })}
                      rows={4}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-[14.5px] text-white resize-none focus:outline-none focus:border-indigo leading-relaxed mb-5"
                    />

                    <div className="flex justify-end gap-2.5">
                      <button
                        onClick={() => handleSkip(selected)}
                        disabled={busyId === selected.id}
                        className="px-5 py-2.5 text-[14px] border border-white/15 rounded-xl text-white hover:border-white/30 disabled:opacity-50 transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => handleApprove(selected)}
                        disabled={busyId === selected.id}
                        className="px-5 py-2.5 text-[14px] font-medium text-white rounded-xl shadow-[0_6px_18px_rgba(10,102,194,0.35)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(10,102,194,0.45)] disabled:opacity-50 disabled:translate-y-0 transition-all"
                        style={{ background: ACCENT }}
                      >
                        {busyId === selected.id ? "Sending..." : "Approve & send ->"}
                      </button>
                    </div>
                  </>
                )}

                {view === "sent" && (
                  <>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light mb-2">Reply sent</p>
                    <div className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 text-[14.5px] text-white/90 leading-relaxed">
                      {selected.reply || "-"}
                    </div>
                  </>
                )}

                {view === "skipped" && (
                  <>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-light mb-2">Skipped</p>
                    <p className="text-slate-light text-sm mb-3">This message was skipped. No reply was sent.</p>
                    {selected.reply && (
                      <div className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 text-[14.5px] text-white/50 leading-relaxed">
                        {selected.reply}
                        <p className="text-[10.5px] text-slate-light mt-2 normal-case">Drafted, not sent.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-xl text-sm shadow-zy-lg border border-white/10">
          {toast}
        </div>
      )}
    </main>
  );
}