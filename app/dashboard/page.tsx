"use client";
export const dynamic = "force-dynamic";

import ZyntaskLoader from "../components/ZyntaskLoader";
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
  outcome: string | null;
  outcome_value: string | null;
  outcome_marked_at: string | null;
  voice_match_confidence: number | null;
  voice_match_note: string | null;
  scheduled_at: string | null;
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
  item, drafts, setDrafts, busyId, handleApprove, handleSkip, handlePublishPost, handleSchedulePost, schedulingPost, handleMarkOutcome, outcomeMenuId, setOutcomeMenuId, markingOutcome, attachmentData, attachmentName, attachmentType, setAttachmentData, setAttachmentName, setAttachmentType, view
}: {
  item: Interaction;
  drafts: Record<string, string>;
  setDrafts: (d: Record<string, string>) => void;
  busyId: string | null;
  handleApprove: (item: Interaction) => void;
  handleSkip: (item: Interaction, reason?: string) => void;
  handlePublishPost: (item: Interaction) => void;
  handleSchedulePost: (id: string, scheduledAt: string) => void;
  schedulingPost: boolean;
  handleMarkOutcome: (id: string, outcome: string, outcomeValue: string) => void;
  outcomeMenuId: string | null;
  setOutcomeMenuId: (id: string | null) => void;
  markingOutcome: string | null;
  attachmentData: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  setAttachmentData: (v: string | null) => void;
  setAttachmentName: (v: string | null) => void;
  setAttachmentType: (v: string | null) => void;
  view: string;
}) {
  const isPost = item.type === "post_draft";
  const [showSkipReasons, setShowSkipReasons] = useState(false);
  useEffect(() => { setShowSkipReasons(false); }, [item.id]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [customDateTime, setCustomDateTime] = useState("");
  const [previewMode, setPreviewMode] = useState(true);
  useEffect(() => { setPreviewMode(true); }, [item.id]);
  const getBestTimes = () => {
    const now = new Date();
    const slots: Date[] = [];
    for (let i = 0; i < 14 && slots.length < 3; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const day = d.getDay();
      if (day >= 1 && day <= 4) {
        const morning = new Date(d); morning.setHours(8, 0, 0, 0);
        if (morning > now) slots.push(morning);
        const evening = new Date(d); evening.setHours(17, 30, 0, 0);
        if (evening > now) slots.push(evening);
      }
    }
    return slots.slice(0, 3);
  };
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-base flex-shrink-0 text-white" style={{ background: ACCENT }}>
            {item.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white tracking-[-0.01em]">{item.name}</p>
            <p className="text-[12.5px] text-slate-light/80">{item.role}</p>
          </div>
        </div>
        <span className="text-[12px] text-slate-light pt-1">{formatTime(item.created_at)}</span>
      </div>

      <div className={isPost ? "overflow-y-auto no-scrollbar space-y-4 pb-8" : "flex-1 overflow-y-auto no-scrollbar space-y-4 pb-8"}>
        {item.post && (
          <div className="text-[12.5px] text-slate-light/85 rounded-xl px-4 py-3.5 leading-[1.6] border border-white/[0.06]" style={{ background: "rgba(0,0,0,0.16)" }}>
            On: {item.post}
          </div>
        )}

        {item.type === "comment" && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl border border-white/[0.06]" style={{ background: "rgba(122,108,255,0.05)" }}>
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 mt-0.5 stroke-indigo stroke-[2] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4v4m0 4h.01"/></svg>
            <p className="text-[11.5px] text-slate-light leading-relaxed">Replying quickly extends your reach. LinkedIn shows a post to more people when you engage with early comments.</p>
          </div>
        )}

        <div className="text-[15px] text-white/90 rounded-2xl px-5 py-5 leading-[1.7] border border-white/[0.08]" style={{ background: "linear-gradient(165deg, rgba(91,75,255,0.04), rgba(0,0,0,0.15))" }}>
          {item.text}
        </div>

        {!isPost && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl px-3 py-2.5 border border-white/[0.07]" style={{ background: "rgba(255,255,255,0.025)" }}>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-0.5">Classified</p>
              <p className="text-[12.5px] font-medium" style={{ color: "#5B9BFF", opacity: 0.85 }}>{item.classification}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5 border border-white/[0.07]" style={{ background: "rgba(255,255,255,0.025)" }}>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-0.5">Intent</p>
              <p className="text-[14px] font-semibold text-white truncate tracking-[-0.005em]">{item.intent || "-"}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5 border border-white/[0.07]" style={{ background: "rgba(255,255,255,0.025)" }}>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-0.5">Confidence</p>
              <p className="text-[12.5px] font-mono text-white/75">{item.confidence != null ? `${item.confidence}%` : "-"}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5 border border-white/[0.07]" style={{ background: "rgba(255,255,255,0.025)" }}>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-0.5">Routing</p>
              <span className={`text-[12px] font-bold uppercase tracking-wide ${item.requires_human ? "text-amber" : "text-green-400"}`} style={{ textShadow: item.requires_human ? "0 0 20px rgba(245,166,35,0.25)" : "0 0 20px rgba(74,222,128,0.2)" }}>
                {item.requires_human ? "Needs you" : "Safe to auto"}
              </span>
            </div>
          </div>
        )}

        {item.reasoning && !isPost && (
          <div className="rounded-xl px-3.5 py-2.5 border border-white/[0.05]" style={{ background: "rgba(255,255,255,0.018)" }}>
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-light/50 mb-1">Why this classification</p>
            <p className="text-[12.5px] text-white/65 leading-[1.65] font-light">{item.reasoning}</p>
          </div>
        )}

        {item.temperature && !isPost && (
          <div className="rounded-lg px-3.5 py-3 border" style={{
            background: item.temperature === "hot" ? "linear-gradient(135deg, rgba(255,138,76,0.12), rgba(255,68,108,0.08))" : item.temperature === "warm" ? "linear-gradient(135deg, rgba(245,180,80,0.10), rgba(245,140,35,0.06))" : "linear-gradient(135deg, rgba(91,140,255,0.08), rgba(74,120,255,0.05))",
            borderColor: item.temperature === "hot" ? "rgba(255,138,76,0.30)" : item.temperature === "warm" ? "rgba(245,166,35,0.25)" : "rgba(91,140,255,0.22)"
          }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: item.temperature === "hot" ? "#FF4444" : item.temperature === "warm" ? "#F5A623" : "#4A9EFF" }}>
              {item.temperature === "hot" ? "Hot lead" : item.temperature === "warm" ? "Warm lead" : "Cold"} · Lead temperature
            </p>
            <p className="text-[12.5px] text-white/80 leading-relaxed">{item.temperature_reason}</p>
          </div>
        )}

        {item.suggested_action && !isPost && (
          <div className="rounded-lg px-3.5 py-3 border" style={{ background: "linear-gradient(135deg, rgba(122,108,255,0.12), rgba(91,75,255,0.05))", borderColor: "rgba(122,108,255,0.28)" }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#8a6ff0" }}>Suggested next step</p>
            <p className="text-[12.5px] text-white/85 leading-relaxed">{item.suggested_action}</p>
          </div>
        )}

        {view === "sent" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-2">{isPost ? "Post published" : "Reply sent"}</p>
            <div className="w-full rounded-xl px-4 py-3.5 text-[14.5px] text-white/90 leading-relaxed whitespace-pre-wrap border border-white/[0.08]" style={{ background: "rgba(0,0,0,0.18)" }}>
              {item.reply || "-"}
            </div>
          {view === "sent" && !item.outcome && (
            <div className="relative mt-3">
              <button
                onClick={() => setOutcomeMenuId(outcomeMenuId === item.id ? null : item.id)}
                className="w-full py-2.5 text-[12px] font-semibold border border-indigo/30 rounded-xl text-indigo hover:bg-indigo/10 transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-current stroke-[2] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l2.4 4.8 5.3.8-3.8 3.7.9 5.2L10 14l-4.8 2.5.9-5.2L2.3 7.6l5.3-.8z"/></svg>
                Mark as win
              </button>
              {outcomeMenuId === item.id && (
                <div className="absolute bottom-full mb-2 left-0 right-0 rounded-[16px] overflow-hidden z-10 border border-white/[0.1]" style={{ background: "linear-gradient(165deg, #1A1E36 0%, #12142400 100%), #14162a", boxShadow: "0 20px 50px -15px rgba(0,0,0,0.7)" }}>
                  {["Became a client", "Got a meeting", "Led to a referral", "Replied positively", "Other win"].map(o => (
                    <button key={o} onClick={() => handleMarkOutcome(item.id, "win", o)}
                      disabled={markingOutcome === item.id}
                      className="w-full text-left px-4 py-3 text-[13px] text-white hover:bg-white/5 transition-colors border-b border-white/10 last:border-0"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {view === "sent" && item.outcome && (
            <div className="mt-3 px-4 py-3 rounded-xl border border-green-500/25 bg-green-500/08">
              <p className="text-[11px] font-bold uppercase tracking-wider text-green-500 mb-0.5">Win recorded</p>
              <p className="text-[13px] text-white/80">{item.outcome_value || item.outcome}</p>
            </div>
          )}
          </div>
        )}

        {view === "skipped" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-light/70 mb-2">Skipped</p>
            <p className="text-slate-light text-sm">This message was skipped. No reply was sent.</p>
          </div>
        )}
      </div>

      {(view === "pending" || view === "posts") && (
        <div className="pt-3 border-t border-white/10 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-light/70">
              {isPost ? "Review your draft" : "Reply"}
            </p>
            <div className="flex gap-1 bg-black/25 rounded-lg p-0.5">
              <button type="button" onClick={() => setPreviewMode(true)} className={`text-[10.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${previewMode ? "bg-white/10 text-white" : "text-slate-light hover:text-white"}`}>Preview</button>
              <button type="button" onClick={() => setPreviewMode(false)} className={`text-[10.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${!previewMode ? "bg-white/10 text-white" : "text-slate-light hover:text-white"}`}>Edit</button>
            </div>
          </div>
          {previewMode && (
            <div className="rounded-xl border border-white/[0.08] p-4" style={{ background: "rgba(0,0,0,0.22)" }}>
              {isPost ? (
                <div className="space-y-3">
                  <p className="text-[14.5px] text-white/90 leading-relaxed whitespace-pre-wrap">{drafts[item.id] || "Nothing written yet."}</p>
                  {attachmentName && (
                    <div className="rounded-lg border border-white/10 px-3 py-2 text-[11.5px] text-slate-light flex items-center gap-2">
                      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-current stroke-[1.8] fill-none flex-shrink-0" strokeLinecap="round"><path d="M4 16l4-4 3 3 4-5 5 6H4z"/><circle cx="7" cy="7" r="1.5"/><rect x="2" y="2" width="16" height="16" rx="2"/></svg>
                      {attachmentName}
                    </div>
                  )}
                </div>
              ) : item.type === "comment" ? (
                <div className="space-y-3">
                  {item.post && (
                    <p className="text-[12px] text-slate-light/60 leading-relaxed border-l-2 border-white/10 pl-3">{item.post}</p>
                  )}
                  <div className="text-[13px] text-white/70 leading-relaxed">
                    <span className="font-semibold text-white/85">{item.name}: </span>{item.text}
                  </div>
                  <div className="ml-4 rounded-xl px-3.5 py-2.5 text-[13px] text-white leading-relaxed" style={{ background: "rgba(122,108,255,0.12)", border: "1px solid rgba(122,108,255,0.25)" }}>
                    <span className="font-semibold">You: </span>{drafts[item.id] || "Nothing written yet."}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] text-white/85 leading-relaxed" style={{ background: "rgba(255,255,255,0.07)" }}>{item.text}</div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px] text-white leading-relaxed" style={{ background: ACCENT }}>{drafts[item.id] || "Nothing written yet."}</div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!previewMode && (
          <textarea
            key={item.id + "-reply"}
            value={drafts[item.id] ?? ""}
            onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value })}
            rows={isPost ? 10 : 4}
            className="w-full rounded-xl px-4 py-3 text-[14.5px] text-white resize-y focus:outline-none transition-colors border border-white/[0.08] focus:border-indigo/50 no-scrollbar" style={{ background: "rgba(0,0,0,0.22)" }}
          />
          )}
          {!isPost && item.voice_match_confidence !== null && item.voice_match_confidence !== undefined && item.voice_match_confidence < 70 && item.voice_match_note && (
            <p className="text-[11.5px] text-slate-light/70 mt-1.5 italic">{item.voice_match_note}</p>
          )}
          {isPost && view === "posts" && (
            <div className="mb-2">
              {showScheduler ? (
                <div className="bg-black/20 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                  <p className="text-[11px] text-slate-light">Best times this week</p>
                  <div className="flex gap-2 flex-wrap">
                    {getBestTimes().map((t, i) => (
                      <button key={i} onClick={() => { handleSchedulePost(item.id, t.toISOString()); setShowScheduler(false); }} className="text-[11.5px] px-3 py-1.5 rounded-lg border border-indigo/30 text-indigo hover:bg-indigo/10 transition-colors">
                        {t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })} {t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input type="datetime-local" value={customDateTime} onChange={e => setCustomDateTime(e.target.value)} style={{ colorScheme: "dark" }} className="flex-1 bg-black/25 text-white text-[12px] rounded-lg px-2.5 py-2 border border-white/15 focus:outline-none focus:border-indigo/40" />
                    <button onClick={() => { if (customDateTime) { handleSchedulePost(item.id, new Date(customDateTime).toISOString()); setShowScheduler(false); } }} disabled={!customDateTime || schedulingPost} className="text-[11.5px] px-3 py-2 rounded-lg text-white disabled:opacity-40 flex-shrink-0" style={{ background: ACCENT }}>Set</button>
                  </div>
                  <button onClick={() => setShowScheduler(false)} className="text-[10.5px] text-slate-light hover:underline">Cancel</button>
                </div>
              ) : item.scheduled_at ? (
                <div className="flex items-center justify-between gap-2 bg-indigo/10 border border-indigo/25 rounded-xl px-3.5 py-2.5">
                  <span className="text-[12px] text-indigo font-medium">
                    Scheduled {new Date(item.scheduled_at!).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {new Date(item.scheduled_at!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button onClick={() => setShowScheduler(true)} className="text-[11px] text-indigo hover:underline flex-shrink-0">Change</button>
                </div>
              ) : (
                <button onClick={() => setShowScheduler(true)} disabled={schedulingPost} className="w-full py-2 text-[12px] border border-indigo/30 rounded-xl text-indigo hover:bg-indigo/10 transition-colors disabled:opacity-50">
                  Schedule this post
                </button>
              )}
            </div>
          )}
          {isPost && view === "posts" && (
            <div className="mb-2">
              <label className="flex items-center gap-2 cursor-pointer w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/20 hover:border-white/25 transition-colors">
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-current stroke-[1.8] fill-none flex-shrink-0 text-slate-light" strokeLinecap="round"><path d="M4 16l4-4 3 3 4-5 5 6H4z"/><circle cx="7" cy="7" r="1.5"/><rect x="2" y="2" width="16" height="16" rx="2"/></svg>
                <span className="text-[12px] text-slate-light flex-1 truncate">{attachmentName || "Attach image or document"}</span>
                {attachmentName && <button onClick={() => { setAttachmentData(null); setAttachmentName(null); setAttachmentType(null); }} className="text-rose text-[10px]">Remove</button>}
                <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      setAttachmentData(ev.target?.result as string);
                      setAttachmentName(file.name);
                      setAttachmentType(file.type);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          )}
          <div className="flex gap-2.5">
            {!isPost && (
              showSkipReasons ? (
                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-light">Why skip this?</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["Off-topic", "Wrong tone", "Not now", "Other"].map((r) => (
                      <button key={r} onClick={() => handleSkip(item, r)} disabled={busyId === item.id} className="text-[10.5px] px-2.5 py-1.5 rounded-full border border-white/15 text-slate-light hover:border-white/40 hover:text-white transition-colors disabled:opacity-50">{r}</button>
                    ))}
                    <button onClick={() => handleSkip(item)} disabled={busyId === item.id} className="text-[10.5px] px-2.5 py-1.5 rounded-full text-slate-light hover:text-white transition-colors underline disabled:opacity-50">Skip anyway</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowSkipReasons(true)}
                  disabled={busyId === item.id}
                  className="flex-1 py-3 text-[14px] border border-white/15 rounded-xl text-white hover:border-white/30 disabled:opacity-50"
                >
                  Skip
                </button>
              )
            )}
            <button
              onClick={() => isPost ? handlePublishPost(item) : handleApprove(item)}
              disabled={busyId === item.id}
              className={`py-3 text-[14px] font-medium text-white rounded-xl shadow-[0_6px_18px_rgba(10,102,194,0.35)] hover:opacity-95 hover:-translate-y-[1px] disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200 ${isPost ? "w-full" : "flex-[2]"}`}
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<"approve" | "skip" | null>(null);
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reviewLink, setReviewLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastScheduledAt, setToastScheduledAt] = useState<string | null>(null);
  const [sentToday, setSentToday] = useState(0);
  const [dailyCap, setDailyCap] = useState(100);
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const [view, setView] = useState<ViewTab>("pending");
  const [linkedinConnected, setLinkedinConnected] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [ideas, setIdeas] = useState<{hook: string; prompt: string}[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [markingOutcome, setMarkingOutcome] = useState<string | null>(null);
  const [outcomeMenuId, setOutcomeMenuId] = useState<string | null>(null);
  const [schedulePostId, setSchedulePostId] = useState<string | null>(null);
  const [schedulingPost, setSchedulingPost] = useState(false);
  const [postTopic, setPostTopic] = useState("");
  const [postNotes, setPostNotes] = useState("");
  const [draftingPost, setDraftingPost] = useState(false);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

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

  // Background polling refresh - only adds genuinely new items and never
  // touches drafts for items already on screen, so it never overwrites
  // a reply someone is actively typing but has not sent yet.
  const pollForNewItems = async (clientId: string, status: ViewTab) => {
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

    setItems((prevItems) => {
      const prevIds = new Set(prevItems.map((i) => i.id));
      const newIds = new Set(filtered.map((i: Interaction) => i.id));
      const sameSize = prevIds.size === newIds.size;
      const sameContents = sameSize && [...prevIds].every((id) => newIds.has(id));
      if (sameContents) return prevItems;
      return filtered as Interaction[];
    });

    setDrafts((prev) => {
      const updated = { ...prev };
      filtered.forEach((item: Interaction) => {
        if (!(item.id in prev)) {
          updated[item.id] = item.reply || "";
        }
      });
      return updated;
    });
  };
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("engage_checklist_dismissed");
      if (!dismissed) setShowChecklist(true);
    }
  }, []);

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

  useEffect(() => {
    if (!myClientId) return;
    const interval = setInterval(() => {
      pollForNewItems(myClientId, view);
    }, 30000);
    return () => clearInterval(interval);
  }, [myClientId, view]);

  const handleTabChange = async (tab: ViewTab) => {
    setView(tab);
    setClassFilter("all");
    if (myClientId) await loadQueue(myClientId, tab);
  };

  const showToast = (msg: string, scheduledAt?: string) => {
    setToast(msg);
    setToastScheduledAt(scheduledAt || null);
    setTimeout(() => { setToast(""); setToastScheduledAt(null); }, scheduledAt ? 4000 : 2500);
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

  const handleGenerateReviewLink = async () => {
    setGeneratingLink(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/review/generate", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const url = `${window.location.origin}/review/${data.token}`;
        setReviewLink(url);
        await navigator.clipboard.writeText(url);
        showToast("Review link copied - expires in 48 hours.");
      } else {
        showToast("Failed to generate link.");
      }
    } catch {
      showToast("Could not reach the server.");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleSkip = async (item: Interaction, reason?: string) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, client_id: item.client_id, reason }),
      });
      if (!res.ok) { showToast("Failed to skip."); return; }
      showToast("Skipped.");
      setSheetOpen(false);
      if (myClientId) { await loadMeta(myClientId); await loadQueue(myClientId, view); }
    } catch { showToast("Could not reach the server."); }
    finally { setBusyId(null); }
  };

  const handleBulkApprove = async () => {
    setBulkBusy(true);
    setBulkAction("approve");
    const ids = Array.from(selectedIds);
    let failed = 0;
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      const text = drafts[id]?.trim();
      if (!item || !text) { failed++; continue; }
      try {
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, client_id: item.client_id, text }),
        });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    showToast(failed > 0 ? `Approved ${ids.length - failed}, ${failed} failed.` : `Approved ${ids.length}.`);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkBusy(false);
    setBulkAction(null);
    if (myClientId) { await loadMeta(myClientId); await loadQueue(myClientId, view); }
  };

  const handleBulkSkip = async () => {
    setBulkBusy(true);
    setBulkAction("skip");
    const ids = Array.from(selectedIds);
    let failed = 0;
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) { failed++; continue; }
      try {
        const res = await fetch("/api/skip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, client_id: item.client_id, reason: "Other" }),
        });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    showToast(failed > 0 ? `Skipped ${ids.length - failed}, ${failed} failed.` : `Skipped ${ids.length}.`);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkBusy(false);
    setBulkAction(null);
    if (myClientId) { await loadMeta(myClientId); await loadQueue(myClientId, view); }
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
        body: JSON.stringify({ id: item.id, text, attachment_data: attachmentData, attachment_name: attachmentName, attachment_type: attachmentType }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Failed to publish."); return; }
      showToast("Published to LinkedIn.");
      setAttachmentData(null); setAttachmentName(null); setAttachmentType(null);
      setSheetOpen(false);
      if (myClientId) await loadQueue(myClientId, "posts");
    } catch { showToast("Could not reach the server."); }
    finally { setBusyId(null); }
  };

  const handleGetIdeas = async () => {
    setLoadingIdeas(true);
    setIdeasOpen(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/post-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Failed to get ideas."); return; }
      setIdeas(result.ideas || []);
    } catch { showToast("Could not reach the server."); }
    finally { setLoadingIdeas(false); }
  };

  const handleDeleteDraft = async (id: string, reason?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/delete-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id, reason }),
      });
      if (!res.ok) { showToast("Failed to delete."); return; }
      showToast("Draft deleted.");
      setConfirmDeleteId(null);
      if (myClientId) await loadQueue(myClientId, "posts");
    } catch { showToast("Could not reach the server."); }
  };

  const handleSchedulePost = async (id: string, scheduledAt: string) => {
    setSchedulingPost(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/schedule-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id, scheduled_at: scheduledAt }),
      });
      if (!res.ok) { showToast("Failed to schedule."); return; }
      showToast("Post scheduled.", scheduledAt);
      setSchedulePostId(null);
      if (myClientId) await loadQueue(myClientId, "posts");
    } catch { showToast("Could not reach the server."); }
    finally { setSchedulingPost(false); }
  };

  const handleMarkOutcome = async (id: string, outcome: string, outcomeValue: string) => {
    setMarkingOutcome(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/mark-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id, outcome, outcome_value: outcomeValue }),
      });
      if (!res.ok) { showToast("Failed to mark outcome."); return; }
      showToast("Win recorded!");
      setOutcomeMenuId(null);
      if (myClientId) await loadQueue(myClientId, view);
    } catch { showToast("Could not reach the server."); }
    finally { setMarkingOutcome(null); }
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
      showToast(result.hookStrength && result.hookStrength !== "strong" && result.hookNote ? `Post drafted. ${result.hookNote}` : "Post drafted. Strong opening.");
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
      <main className="relative min-h-screen flex items-center justify-center bg-ink overflow-hidden">
        <div className="aurora-page-dark" />
        <div className="relative z-10">
          <ZyntaskLoader />
        </div>
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
    <main className="relative min-h-screen bg-ink overflow-x-hidden font-display">
      <div className="aurora-page-dark" />
      <div className="relative z-10">
      <style jsx global>{`select option { background-color: #1a1d29; color: #ffffff; }`}</style>

      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: "linear-gradient(180deg, rgba(20,23,42,0.55) 0%, rgba(15,17,30,0.25) 70%, rgba(15,17,30,0) 100%)" }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-[62px] md:h-[72px] flex items-center justify-between gap-6">
          <span className="relative font-serif font-semibold text-2xl md:text-3xl text-white tracking-tight flex items-center gap-2.5">
            Engage<span style={{ color: "#8a6ff0" }}>.</span>
          </span>
          <div className="flex items-center gap-3 md:gap-8">
            <div className="flex items-center gap-2.5 text-[11px] md:text-[12.5px] text-slate-light">
              <span className="hidden sm:inline">Sent today</span>
              <div className="w-16 md:w-24 h-[5px] md:h-[6px] bg-white/10 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${capPct}%`, background: ACCENT }} />
              </div>
              <span className="font-mono text-white">{sentToday}/{dailyCap}</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="/calendar" target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Calendar</a>
              <a href="/analytics" target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Analytics</a>
              <div className="relative">
                <button onClick={() => setMoreMenuOpen(!moreMenuOpen)} className="flex items-center gap-1 text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">
                  More
                  <svg viewBox="0 0 20 20" className={`w-3 h-3 stroke-current stroke-[2] fill-none transition-transform ${moreMenuOpen ? "rotate-180" : ""}`} strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-[14px] shadow-xl overflow-hidden z-50">
                    <a href="/voice" target="_blank" rel="noopener noreferrer" onClick={() => setMoreMenuOpen(false)} className="block px-4 py-3 text-[13px] text-slate-light hover:bg-white/5 hover:text-white transition-colors border-b border-white/[0.06]">Voice</a>
                    <button onClick={() => { handleGenerateReviewLink(); setMoreMenuOpen(false); }} disabled={generatingLink} className="w-full text-left px-4 py-3 text-[13px] text-slate-light hover:bg-white/5 hover:text-white transition-colors border-b border-white/[0.06] disabled:opacity-50">{generatingLink ? "Generating..." : "Get review link"}</button>
                    <a href="/welcome" onClick={() => setMoreMenuOpen(false)} className="block px-4 py-3 text-[13px] text-slate-light hover:bg-white/5 hover:text-white transition-colors">Home</a>
                  </div>
                )}
              </div>
            </div>
            <div className="relative md:hidden">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu" aria-expanded={mobileMenuOpen} className="p-2 -mr-2 text-slate-light hover:text-white transition-colors">
                <svg viewBox="0 0 20 20" className="w-5 h-5 stroke-current stroke-[1.8] fill-none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              </button>
              {mobileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-[14px] shadow-xl overflow-hidden z-50">
                  <a href="/calendar" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[13.5px] text-slate-light hover:bg-white/5 hover:text-white transition-colors border-b border-white/[0.06]">Calendar</a>
                  <a href="/analytics" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[13.5px] text-slate-light hover:bg-white/5 hover:text-white transition-colors border-b border-white/[0.06]">Analytics</a>
                  <a href="/voice" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[13.5px] text-slate-light hover:bg-white/5 hover:text-white transition-colors border-b border-white/[0.06]">Voice</a>
                  <a href="/welcome" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[13.5px] text-slate-light hover:bg-white/5 hover:text-white transition-colors">Back to home</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-7 py-5 md:py-10">
        {!linkedinConnected ? (
          <div className="rounded-[24px] p-12 text-center border border-white/[0.10]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)" }}>
            <p className="font-serif text-2xl text-white mb-2">Setting up your LinkedIn connection.</p>
            <p className="text-slate-light text-sm max-w-md mx-auto leading-relaxed">
              We are finishing setup on our end. This usually takes under 24 hours.
            </p>
          </div>
        ) : (
          <>
            {showChecklist && (
              <div className="rounded-[20px] p-5 mb-5 border border-white/[0.10] relative" style={{ background: "linear-gradient(150deg, rgba(91,75,255,0.10), rgba(138,111,240,0.03))" }}>
                <button
                  onClick={() => { setShowChecklist(false); if (typeof window !== "undefined") { localStorage.setItem("engage_checklist_dismissed", "1"); } }}
                  className="absolute top-4 right-4 text-slate-light hover:text-white transition-colors"
                >
                  <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>
                </button>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo mb-3">New here? Start with these</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button onClick={() => setDraftModalOpen(true)} className="text-left px-4 py-3 rounded-xl border border-white/[0.08] hover:border-indigo/40 transition-all" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <p className="text-[13px] font-semibold text-white mb-0.5">Draft your first post</p>
                    <p className="text-[11.5px] text-slate-light">Get post ideas and publish in your voice</p>
                  </button>
                  <a href="/voice" className="text-left px-4 py-3 rounded-xl border border-white/[0.08] hover:border-indigo/40 transition-all block" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <p className="text-[13px] font-semibold text-white mb-0.5">Check your voice profile</p>
                    <p className="text-[11.5px] text-slate-light">See and edit how Engage sounds like you</p>
                  </a>
                  <a href="/calendar" className="text-left px-4 py-3 rounded-xl border border-white/[0.08] hover:border-indigo/40 transition-all block" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <p className="text-[13px] font-semibold text-white mb-0.5">See your content calendar</p>
                    <p className="text-[11.5px] text-slate-light">Drafted, scheduled, and published posts</p>
                  </a>
                </div>
              </div>
            )}
          <div className="md:grid md:grid-cols-[320px_1fr] md:gap-6">
            {/* Left panel */}
            <div className="rounded-[24px] overflow-hidden border border-white/[0.10] md:h-[calc(100vh-160px)] md:flex md:flex-col" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)" }}>
              <div className="px-4 md:px-5 py-4 border-b border-white/[0.08] space-y-3">
                {/* View tabs */}
                <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                  {(["pending", "sent", "skipped", "posts"] as ViewTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(tab)}
                      className="flex-1 text-[10px] font-medium py-2 rounded-lg transition-all duration-200"
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
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-light/75">{TAB_LABELS[view]}</span>
                  <span className="text-[11px] font-mono text-slate-light">{visibleItems.length} of {items.length}</span>
                </div>

                {view !== "posts" && (
                  <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                    {(["all", "dm", "comment"] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className="flex-1 text-[11px] font-medium py-2 rounded-lg transition-all duration-200"
                        style={filter === f ? { background: ACCENT, color: "#fff" } : { color: "#9b95a8" }}
                      >
                        {f === "all" ? "All" : f === "dm" ? "DMs" : "Comments"}
                      </button>
                    ))}
                  </div>
                )}

                {classifications.length > 0 && view !== "posts" && (
                  <div className="relative">
                    <button onClick={() => setClassFilterOpen(!classFilterOpen)} className="w-full flex items-center justify-between text-[11.5px] rounded-lg pl-2.5 pr-2.5 py-2 text-white border border-white/[0.08]" style={{ background: "rgba(0,0,0,0.25)" }}>
                      <span>{classFilter === "all" ? "All types" : classFilter}</span>
                      <svg className={`w-3 h-3 text-slate-light transition-transform ${classFilterOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    {classFilterOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-[10px] shadow-xl overflow-hidden z-50">
                        <button onClick={() => { setClassFilter("all"); setClassFilterOpen(false); }} className="w-full text-left px-3 py-2 text-[11.5px] text-white hover:bg-white/10 transition-colors">All types</button>
                        {classifications.map((c) => (
                          <button key={c} onClick={() => { setClassFilter(c); setClassFilterOpen(false); }} className="w-full text-left px-3 py-2 text-[11.5px] text-white hover:bg-white/10 transition-colors">{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 md:overflow-y-auto no-scrollbar">
              {(view === "pending") && (
                <div className="px-4 md:px-5 py-2 flex items-center justify-between border-b border-white/[0.08]">
                  {!selectMode ? (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-[11px] font-medium text-slate-light hover:text-white transition-colors"
                    >
                      Select
                    </button>
                  ) : (
                    <button
                      onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                      className="text-[11px] font-medium text-slate-light hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              {selectMode && selectedIds.size > 0 && (
                <div
                  className="px-4 md:px-5 py-3.5 flex items-center justify-between gap-3 border-b border-white/[0.1] sticky top-0 z-10 backdrop-blur-xl"
                  style={{ background: "linear-gradient(135deg, rgba(91,75,255,0.16), rgba(138,111,240,0.09))", boxShadow: "0 4px 24px rgba(91,75,255,0.10)" }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] text-white/90 font-medium">{selectedIds.size} selected</span>
                    {(() => {
                      const selected = items.filter((i) => selectedIds.has(i.id));
                      const avgConf = selected.length ? Math.round(selected.reduce((s, i) => s + (i.confidence ?? 0), 0) / selected.length) : 0;
                      const lowConfCount = selected.filter((i) => (i.confidence ?? 100) < 70).length;
                      return (
                        <span className="text-[10px] text-slate-light/70">
                          Avg confidence {avgConf}%{lowConfCount > 0 ? ` \u00b7 ${lowConfCount} below 70%` : ""}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBulkSkip}
                      disabled={bulkBusy}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-full border border-white/15 text-slate-light hover:border-white/40 hover:text-white transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {bulkAction === "skip" && (
                        <span className="w-2.5 h-2.5 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />
                      )}
                      {bulkAction === "skip" ? "Skipping..." : `Skip (${selectedIds.size})`}
                    </button>
                    <button
                      onClick={handleBulkApprove}
                      disabled={bulkBusy}
                      className="text-[11px] font-semibold px-3.5 py-1.5 rounded-full text-white transition-all disabled:opacity-60 flex items-center gap-1.5"
                      style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)", boxShadow: "0 2px 12px rgba(91,75,255,0.35)" }}
                    >
                      {bulkAction === "approve" && (
                        <span className="w-2.5 h-2.5 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />
                      )}
                      {bulkAction === "approve" ? "Approving..." : `Approve (${selectedIds.size})`}
                    </button>
                  </div>
                </div>
              )}
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
                    style={item.id === selectedId ? { background: "linear-gradient(90deg, rgba(91,75,255,0.10), rgba(91,75,255,0.02))", borderLeft: "3px solid #7A6CFF", boxShadow: "inset 0 0 0 1px rgba(122,108,255,0.08)" } : { borderLeft: "3px solid transparent", opacity: 0.82 }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {selectMode && item.type !== "post_draft" && !item.requires_human && (
                          <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                              className="appearance-none w-[19px] h-[19px] rounded-[7px] border cursor-pointer transition-all duration-200"
                              style={selectedIds.has(item.id)
                                ? { background: "linear-gradient(135deg,#5B4BFF,#8a6ff0)", borderColor: "transparent", boxShadow: "0 2px 10px rgba(91,75,255,0.45)" }
                                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.22)" }}
                            />
                            {selectedIds.has(item.id) && (
                              <svg viewBox="0 0 20 20" className="w-3 h-3 stroke-white stroke-[3] fill-none absolute top-[3.5px] left-[3.5px] pointer-events-none" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 10.5 8.5 15 16 5.5" />
                              </svg>
                            )}
                          </div>
                        )}
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white px-2 py-1 rounded-md flex-shrink-0">
                          {item.type === "post_draft" ? "Post" : item.type === "dm" ? "DM" : "Comment"}
                        </span>
                        <span className="text-[14px] font-semibold text-white/95 truncate flex items-center tracking-[-0.005em]">
                          <TempDot temp={item.temperature} />
                          {item.type === "post_draft" ? item.text.slice(0, 40) + "..." : item.name}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-light flex-shrink-0">{formatTime(item.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-slate-light/75 leading-relaxed truncate">
                      {item.type === "post_draft" ? item.reply?.slice(0, 80) + "..." : item.text}
                    </p>
                    {item.type === "post_draft" && (
                      <div className="flex justify-end mt-2" onClick={e => e.stopPropagation()}>
                        {confirmDeleteId === item.id ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[10px] text-slate-light">Why delete this?</span>
                            <div className="flex flex-wrap gap-1.5 justify-end max-w-[220px]">
                              {["Off-topic", "Wrong tone", "Too salesy", "Other"].map((r) => (
                                <button key={r} onClick={() => handleDeleteDraft(item.id, r)} className="text-[9.5px] px-2 py-1 rounded-full border border-white/15 text-slate-light hover:border-rose/50 hover:text-rose transition-colors">{r}</button>
                              ))}
                              <button onClick={() => setConfirmDeleteId(null)} className="text-[9.5px] px-2 py-1 text-slate-light hover:underline">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(item.id)} className="text-[10.5px] font-medium text-rose/70 hover:text-rose transition-colors flex items-center gap-1">Delete draft</button>
                        )}
                      </div>
                    )}
                  </button>
                ))
              )}
              </div>
            </div>

            {/* Right panel — desktop */}
            <div className="hidden md:block">
              {items.length === 0 ? (
                <div className="rounded-[24px] p-12 text-center border border-white/[0.10] md:h-[calc(100vh-160px)] md:flex md:flex-col md:items-center md:justify-center" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)" }}>
                  <p className="font-serif text-2xl text-white mb-2">{emptyCopy.title}</p>
                  <p className="text-slate-light text-sm">{emptyCopy.body}</p>
                </div>
              ) : selected ? (
                <div className="rounded-[24px] p-8 overflow-hidden border border-white/[0.10] md:h-[calc(100vh-160px)] md:flex md:flex-col" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.10) inset, 0 1px 24px rgba(122,108,255,0.04), 0 30px 70px -25px rgba(0,0,0,0.7)" }}>
                  <DetailPanel item={selected} drafts={drafts} setDrafts={setDrafts} busyId={busyId} handleApprove={handleApprove} handleSkip={handleSkip} handlePublishPost={handlePublishPost} handleSchedulePost={handleSchedulePost} schedulingPost={schedulingPost} handleMarkOutcome={handleMarkOutcome} outcomeMenuId={outcomeMenuId} setOutcomeMenuId={setOutcomeMenuId} markingOutcome={markingOutcome} attachmentData={attachmentData} attachmentName={attachmentName} attachmentType={attachmentType} setAttachmentData={setAttachmentData} setAttachmentName={setAttachmentName} setAttachmentType={setAttachmentType} view={view} />
                </div>
              ) : null}
            </div>
          </div>
          </>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && selected && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="relative border-t border-white/[0.08] rounded-t-[28px] max-h-[90vh] flex flex-col px-5 pt-4 pb-8" style={{ background: "linear-gradient(180deg, #161A2E 0%, #0F1120 100%)", boxShadow: "0 -20px 60px -10px rgba(0,0,0,0.6)" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <button onClick={() => setSheetOpen(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white">
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round">
                <path d="M5 5l10 10M15 5l-10 10" />
              </svg>
            </button>
            <div className="flex-1 overflow-y-auto">
              <DetailPanel item={selected} drafts={drafts} setDrafts={setDrafts} busyId={busyId} handleApprove={handleApprove} handleSkip={handleSkip} handlePublishPost={handlePublishPost} handleSchedulePost={handleSchedulePost} schedulingPost={schedulingPost} handleMarkOutcome={handleMarkOutcome} outcomeMenuId={outcomeMenuId} setOutcomeMenuId={setOutcomeMenuId} markingOutcome={markingOutcome} attachmentData={attachmentData} attachmentName={attachmentName} attachmentType={attachmentType} setAttachmentData={setAttachmentData} setAttachmentName={setAttachmentName} setAttachmentType={setAttachmentType} view={view} />
            </div>
          </div>
        </div>
      )}

      {/* Draft Post Modal */}
      {draftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDraftModalOpen(false)} />
          <div className="relative rounded-[28px] p-7 w-full max-w-lg max-h-[88vh] flex flex-col border border-white/[0.08]" style={{ background: "linear-gradient(165deg, #181C32 0%, #0F1120 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px -20px rgba(0,0,0,0.7)" }}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-light/75 mb-1">Draft a LinkedIn post</p>
            <h3 className="font-serif font-semibold text-[22px] text-white mb-5 flex-shrink-0">What do you want to post about?</h3>
            <div className="overflow-y-auto flex-1 -mr-2 pr-2">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Topic</p>
                <input
                  type="text"
                  value={postTopic}
                  onChange={e => setPostTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleDraftPost(); }}
                  placeholder="e.g. What I learned building Zyntask in 2 weeks"
                  className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder-slate-light focus:outline-none transition-colors border border-white/[0.08] focus:border-indigo/50" style={{ background: "rgba(0,0,0,0.22)" }}
                />
              </div>
              <div>
                <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Key points <span className="normal-case opacity-60">(optional)</span></p>
                <textarea
                  value={postNotes}
                  onChange={e => setPostNotes(e.target.value)}
                  rows={3}
                  placeholder="Any specific angles, stats, or details to include..."
                  className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder-slate-light resize-none focus:outline-none transition-colors border border-white/[0.08] focus:border-indigo/50" style={{ background: "rgba(0,0,0,0.22)" }}
                />
              </div>
            </div>
              {/* Get ideas section */}
              <div className="mb-4">
                <button
                  onClick={handleGetIdeas}
                  disabled={loadingIdeas}
                  className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-3 rounded-xl text-white hover:opacity-90 transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}
                >
                  <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4v4m0 4h.01"/></svg>
                  {loadingIdeas ? "Getting ideas..." : "Get ideas for this week"}
                </button>
                {ideasOpen && ideas.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto">
                    <p className="text-[10px] text-slate-light uppercase tracking-wider font-semibold mb-1">Pick one to draft</p>
                    {ideas.map((idea, i) => (
                      <button
                        key={i}
                        onClick={() => { setPostTopic(idea.hook); setPostNotes(idea.prompt); setIdeasOpen(false); }}
                        className="w-full text-left px-3.5 py-3 rounded-xl border border-white/[0.10] hover:border-indigo/40 transition-all" style={{ background: "rgba(255,255,255,0.025)" }}
                      >
                        <p className="text-[13px] font-semibold text-white mb-0.5">{idea.hook}</p>
                        <p className="text-[11.5px] text-slate-light leading-relaxed">{idea.prompt}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2">
                <button
                  onClick={async () => {
                    const achievement = window.prompt("Describe an achievement or experience to turn into a post:");
                    if (!achievement) return;
                    setDraftingPost(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch("/api/repurpose-post", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
                        body: JSON.stringify({ original_text: achievement, original_reply: "", mode: "achievement" }),
                      });
                      const result = await res.json();
                      if (res.ok) {
                        showToast("Achievement turned into a post draft.");
                        setDraftModalOpen(false);
                        await handleTabChange("posts");
                      }
                    } catch { showToast("Failed. Try again."); }
                    finally { setDraftingPost(false); }
                  }}
                  className="w-full flex items-center justify-center gap-2 text-[12px] font-medium py-2 rounded-lg border border-white/15 text-slate-light hover:text-white hover:border-white/30 transition-all"
                >
                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-current stroke-[2] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l2.4 4.8 5.3.8-3.8 3.7.9 5.2L10 14l-4.8 2.5.9-5.2L2.3 7.6l5.3-.8z"/></svg>
                  Turn an achievement into a post
                </button>
              </div>
              {/* File attachment - full width, own row, drag/drop + paste enabled */}
              <div className="mt-4">
                <p className="text-[11px] text-slate-light uppercase tracking-wide mb-1.5">Attach image <span className="normal-case opacity-60">(optional)</span></p>
                <label
                  className={`flex items-center gap-2 cursor-pointer w-full px-4 py-3 rounded-xl border-2 border-dashed transition-colors ${dragOver ? "border-indigo/60 bg-indigo/[0.06]" : "border-white/15 bg-black/20 hover:border-white/25"}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { showToast("File too large. Max 5MB."); return; }
                    const reader = new FileReader();
                    reader.onload = ev => {
                      setAttachmentData(ev.target?.result as string);
                      setAttachmentName(file.name);
                      setAttachmentType(file.type);
                    };
                    reader.readAsDataURL(file);
                  }}
                  onPaste={e => {
                    const clipItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
                    if (!clipItem) return;
                    const file = clipItem.getAsFile();
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { showToast("File too large. Max 5MB."); return; }
                    const reader = new FileReader();
                    reader.onload = ev => {
                      setAttachmentData(ev.target?.result as string);
                      setAttachmentName(file.name);
                      setAttachmentType(file.type);
                    };
                    reader.readAsDataURL(file);
                  }}
                  tabIndex={0}
                >
                  <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[2] fill-none flex-shrink-0 text-slate-light" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l4-4 3 3 4-5 5 6H4z"/><circle cx="7" cy="7" r="1.5"/><rect x="2" y="2" width="16" height="16" rx="2"/></svg>
                  <span className="text-[13px] text-slate-light flex-1 truncate">{attachmentName || "Drop, paste, or click to choose an image"}</span>
                  {attachmentName && <button onClick={(e) => { e.preventDefault(); setAttachmentData(null); setAttachmentName(null); setAttachmentType(null); }} className="text-rose text-[11px] hover:underline flex-shrink-0">Remove</button>}
                  <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { showToast("File too large. Max 5MB."); return; }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setAttachmentData(ev.target?.result as string);
                        setAttachmentName(file.name);
                        setAttachmentType(file.type);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {attachmentData && (attachmentType || "").startsWith("image/") && (
                  <img src={attachmentData} alt="attachment preview" className="mt-2.5 rounded-lg max-h-[140px] object-cover border border-white/10" />
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button onClick={() => setDraftModalOpen(false)} className="flex-1 py-3 text-[14px] border border-white/15 rounded-xl text-white hover:border-white/30">Cancel</button>
              <button onClick={handleDraftPost} disabled={draftingPost} className="flex-[2] py-3 text-[14px] font-medium text-white rounded-xl disabled:opacity-50" style={{ background: ACCENT }}>
                {draftingPost ? "Drafting..." : "Draft post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (() => {
        const isError = /failed|could not|error|write a|please/i.test(toast);
        return (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm shadow-2xl z-[60] border backdrop-blur-xl min-w-[280px]`} style={{ background: isError ? "linear-gradient(135deg, rgba(58,20,28,0.94), rgba(28,10,16,0.97))" : "linear-gradient(135deg, rgba(18,42,36,0.94), rgba(10,24,20,0.97))", borderColor: isError ? "rgba(244,63,94,0.3)" : "rgba(52,211,153,0.3)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isError ? "rgba(244,63,94,0.18)" : "rgba(52,211,153,0.18)" }}>
              {isError ? (
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-rose-400 stroke-[2.5] fill-none" strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
              ) : (
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 stroke-emerald-400 stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
              )}
            </div>
            <div>
              <p className="text-white font-medium leading-tight">{toast}</p>
              {toastScheduledAt && (
                <div className="flex items-center gap-1.5 mt-1 text-white/65 text-[12px]">
                  <svg viewBox="0 0 20 20" className="w-3 h-3 stroke-current stroke-[2] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v3M13 2v3" /></svg>
                  <span>{new Date(toastScheduledAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {new Date(toastScheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      </div>
    </main>
  );
}
