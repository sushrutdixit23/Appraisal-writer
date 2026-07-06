"use client";
export const dynamic = "force-dynamic";

import ZyntaskLoader from "../components/ZyntaskLoader";
import CommentTargets from "../components/CommentTargets";
import LinkedInImport from "../components/LinkedInImport";
import CollapsibleSection from "../components/CollapsibleSection";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

type VoiceProfile = {
  id: string;
  full_name: string;
  role: string;
  linkedin_url: string;
  voice_tone: string;
  voice_signoff: string;
  voice_rules: string;
  sample1: string;
  sample2: string;
  sample3: string;
  post_tone: string;
  post_rules: string;
  post_sample1: string;
  post_sample2: string;
  post_sample3: string;
};

const TONES = [
  "Warm and friendly",
  "Professional and formal",
  "Direct and concise",
  "Casual and conversational",
];

function StrengthBar({ profile }: { profile: VoiceProfile }) {
  const fields = [
    { label: "Name", filled: !!profile.full_name },
    { label: "Role", filled: !!profile.role },
    { label: "Tone", filled: !!profile.voice_tone },
    { label: "Sign-off", filled: !!profile.voice_signoff },
    { label: "Voice rules", filled: !!profile.voice_rules },
    { label: "Writing sample 1", filled: !!profile.sample1 },
    { label: "Writing sample 2", filled: !!profile.sample2 },
    { label: "Writing sample 3", filled: !!profile.sample3 },
  ];
  const filled = fields.filter(f => f.filled).length;
  const pct = Math.round((filled / fields.length) * 100);
  const missing = fields.filter(f => !f.filled).map(f => f.label);

  return (
    <div className="bg-cloud border border-line rounded-[20px] p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-0.5">Voice profile strength</p>
          <p className="font-display font-bold text-[28px] tracking-tight" style={{ color: pct >= 75 ? "#1FBF75" : pct >= 50 ? "#F5A623" : "#FF4444" }}>{pct}%</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-slate">{filled} of {fields.length} fields complete</p>
          {pct < 100 && <p className="text-[11px] text-slate-light mt-0.5">Every field makes your drafts more accurate</p>}
          {pct === 100 && <p className="text-[11px] text-green-600 mt-0.5">Your voice profile is complete</p>}
        </div>
      </div>
      <div className="h-2 bg-line rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + "%", background: ACCENT }} />
      </div>
      {missing.length > 0 && (
        <p className="text-[11px] text-slate">Missing: {missing.join(", ")}</p>
      )}
    </div>
  );
}

export default function VoicePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [form, setForm] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();

      if (profileData) {
        const p: VoiceProfile = {
          id: profileData.id,
          full_name: profileData.full_name || "",
          role: profileData.role || "",
          linkedin_url: profileData.linkedin_url || "",
          voice_tone: profileData.voice_tone || "",
          voice_signoff: profileData.voice_signoff || "",
          voice_rules: profileData.voice_rules || "",
          sample1: profileData.sample1 || "",
          sample2: profileData.sample2 || "",
          sample3: profileData.sample3 || "",
          post_tone: profileData.post_tone || "",
          post_rules: profileData.post_rules || "",
          post_sample1: profileData.post_sample1 || "",
          post_sample2: profileData.post_sample2 || "",
          post_sample3: profileData.post_sample3 || "",
        };
        setProfile(p);
        setForm(p);
      }
      try {
        const statsRes = await fetch("/api/voice-stats", {
          headers: { "Authorization": `Bearer ${sessionData.session.access_token}` },
        });
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {}
      setStatsLoading(false);
      setLoading(false);
    };
    load();
  }, [router]);

  const set = (k: keyof VoiceProfile, v: string) => setForm(f => f ? { ...f, [k]: v } : f);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name,
          role: form.role,
          linkedin_url: form.linkedin_url,
          voice_tone: form.voice_tone,
          voice_signoff: form.voice_signoff,
          voice_rules: form.voice_rules,
          sample1: form.sample1,
          sample2: form.sample2,
          sample3: form.sample3,
          post_tone: form.post_tone,
          post_rules: form.post_rules,
          post_sample1: form.post_sample1,
          post_sample2: form.post_sample2,
          post_sample3: form.post_sample3,
        })
        .eq("id", form.id);

      if (err) throw err;

      // Also sync voice fields to clients table
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await supabase
          .from("clients")
          .update({
            voice_name: form.full_name,
            voice_role: form.role,
            voice_tone: form.voice_tone,
            voice_signoff: form.voice_signoff,
            voice_rules: form.voice_rules,
          })
          .eq("auth_user_id", sessionData.session.user.id);
      }

      setProfile(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <main className="min-h-screen bg-mist flex items-center justify-center">
      <ZyntaskLoader />
    </main>
  );

  if (!form) return (
    <main className="min-h-screen bg-mist flex items-center justify-center">
      <p className="text-slate text-sm">Profile not found. Complete setup first.</p>
    </main>
  );

  return (
    <main className="min-h-screen bg-mist">
      <SiteNav />
      <div className="max-w-2xl mx-auto px-6 pt-28 pb-20">

        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-1">Identity layer</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink">Your voice profile</h1>
            <p className="text-slate text-[14px] mt-1">Every Zyntask agent reads this. The more complete it is, the more it sounds like you.</p>
          </div>
        </div>

        <StrengthBar profile={form} />

        {!statsLoading && stats && stats.hasEnoughData && (
          <div className="bg-cloud border border-line rounded-[20px] p-6 mb-6">
            <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-1">What Engage has learned</p>
            <p className="text-[12.5px] text-slate mb-5">Based on {stats.totalSent} drafts sent in your voice over {stats.daysActive} day{stats.daysActive !== 1 ? "s" : ""}.</p>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="font-display font-bold text-[28px] text-ink leading-none mb-1">{stats.totalSent}</p>
                <p className="text-[11.5px] text-slate">{stats.repliesSent} replies, {stats.postsSent} posts</p>
              </div>
              {stats.editRate !== null && (
                <div>
                  <p className="font-display font-bold text-[28px] leading-none mb-1" style={{ color: stats.editRate < 30 ? "#1FBF75" : stats.editRate < 60 ? "#F5A623" : "#646B7E" }}>
                    {100 - stats.editRate}%
                  </p>
                  <p className="text-[11.5px] text-slate">
                    {stats.editRate < 30 ? "sent as drafted, no edits" : stats.editRate < 60 ? "needed light edits" : "still learning your voice"}
                  </p>
                </div>
              )}
            </div>
            {stats.topWords && stats.topWords.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-ink-soft mb-2">Words that show up often in your sent replies</p>
                <div className="flex flex-wrap gap-2">
                  {stats.topWords.map((w: string) => (
                    <span key={w} className="text-[12px] px-3 py-1 rounded-full bg-mist border border-line text-ink-soft">{w}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!statsLoading && stats && !stats.hasEnoughData && (
          <div className="bg-cloud border border-line rounded-[20px] p-6 mb-6 text-center">
            <p className="text-[13px] text-slate">Approve a few more replies or posts and Engage will start showing you what it has learned about your voice here.</p>
          </div>
        )}

        <div className="space-y-5">
          <CollapsibleSection title="Basic info" defaultOpen={true}>
            <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate mb-4">Basic info</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Full name</label>
                <input value={form.full_name} onChange={e => set("full_name", e.target.value)}
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Role / headline</label>
                <input value={form.role} onChange={e => set("role", e.target.value)}
                  placeholder="e.g. Founder, Zyntask | Strategy Consultant"
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">LinkedIn URL</label>
                <input value={form.linkedin_url} onChange={e => set("linkedin_url", e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Voice settings" defaultOpen={false}>
            <p className="text-[12.5px] text-slate mb-4">Used for DM replies and comment replies. Posts can optionally use a different voice below.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Tone</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map(t => (
                    <button key={t} onClick={() => set("voice_tone", t)}
                      className="text-left px-4 py-2.5 rounded-xl border text-[13px] transition-all"
                      style={form.voice_tone === t ? { borderColor: "#5B4BFF", background: "rgba(91,75,255,0.06)", color: "#5B4BFF", fontWeight: 600 } : { borderColor: "#E2E6EF", color: "#646B7E" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Sign-off</label>
                <input value={form.voice_signoff} onChange={e => set("voice_signoff", e.target.value)}
                  placeholder="e.g. Best, / Regards, / — Sushrut"
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Voice rules</label>
                <p className="text-[11.5px] text-slate mb-2">Instructions your agents always follow. e.g. "Keep replies under 3 sentences. Never sound salesy."</p>
                <textarea value={form.voice_rules} onChange={e => set("voice_rules", e.target.value)}
                  rows={4} placeholder="e.g. Keep replies to 2-3 sentences. Ask a question to continue the conversation. Never use buzzwords."
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-slate-light resize-y focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Writing samples" defaultOpen={false}>
            <p className="text-[12.5px] text-slate mb-4">Paste 1-3 examples of how you actually write — a LinkedIn reply, a DM, a post. This is the single most powerful thing you can do to make your agents sound like you.</p>
            <div className="space-y-4">
              {([1,2,3] as const).map(n => (
                <div key={n}>
                  <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Sample {n} {n === 1 ? "(most important)" : "(optional)"}</label>
                  <textarea
                    value={form[`sample${n}` as keyof VoiceProfile] as string}
                    onChange={e => set(`sample${n}` as keyof VoiceProfile, e.target.value)}
                    rows={4}
                    placeholder="Paste an example of how you write..."
                    className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[13.5px] text-ink placeholder-slate-light resize-y focus:outline-none focus:border-indigo/40 transition-colors"
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Post voice (optional)" defaultOpen={false}>
            <p className="text-[12.5px] text-slate mb-4">LinkedIn posts are often more polished than a quick reply. Leave any of this blank and Engage falls back to your reply voice above for posts too.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Post tone</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map(t => (
                    <button key={t} onClick={() => set("post_tone", t)}
                      className="text-left px-4 py-2.5 rounded-xl border text-[13px] transition-all"
                      style={form.post_tone === t ? { borderColor: "#5B4BFF", background: "rgba(91,75,255,0.06)", color: "#5B4BFF", fontWeight: 600 } : { borderColor: "#E2E6EF", color: "#646B7E" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Post rules</label>
                <p className="text-[11.5px] text-slate mb-2">Instructions that only apply to posts. e.g. "More opinionated than my replies. Always take a clear stance."</p>
                <textarea value={form.post_rules} onChange={e => set("post_rules", e.target.value)}
                  rows={4} placeholder="e.g. Longer and more considered than my DM replies. Open with a bold claim."
                  className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-slate-light resize-y focus:outline-none focus:border-indigo/40 transition-colors" />
              </div>
              <div className="space-y-4">
                {([1,2,3] as const).map(n => (
                  <div key={n}>
                    <label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Post sample {n} (optional)</label>
                    <textarea
                      value={form[`post_sample${n}` as keyof VoiceProfile] as string}
                      onChange={e => set(`post_sample${n}` as keyof VoiceProfile, e.target.value)}
                      rows={4}
                      placeholder="Paste an example of a post you've written..."
                      className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-[13.5px] text-ink placeholder-slate-light resize-y focus:outline-none focus:border-indigo/40 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
          <CommentTargets />
          <CollapsibleSection title="About & recent posts (LinkedIn import)" defaultOpen={false}>
            <LinkedInImport onPostsImported={(posts) => {
              posts.slice(0, 3).forEach((p, i) => set(`post_sample${i + 1}` as keyof VoiceProfile, p));
            }} />
          </CollapsibleSection>

          {/* Save */}
          {error && <p className="text-rose text-[13px]">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-4 rounded-[14px] text-[15px] font-semibold text-white disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: ACCENT }}>
            {saving ? "Saving..." : saved ? "Saved!" : "Save voice profile"}
          </button>

        </div>
      </div>
    </main>
  );
}
