"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "../components/SiteNav";
import { supabase } from "../lib/supabase";

const TONES = [
  "Warm and friendly",
  "Professional and formal",
  "Direct and concise",
  "Casual and conversational",
];

function StepCard({ number, title, description, status, action, onClick }: {
  number: string; title: string; description: string;
  status: "complete" | "current" | "locked"; action?: string; onClick?: () => void;
}) {
  return (
    <div className={`rounded-[20px] border p-6 transition-all ${
      status === "complete" ? "border-grass/30 bg-grass/5" :
      status === "current" ? "border-indigo/40 bg-indigo/5 shadow-[0_0_24px_rgba(91,75,255,0.08)]" :
      "border-line bg-cloud/50 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
            status === "complete" ? "bg-grass text-white" :
            status === "current" ? "bg-indigo text-white" :
            "bg-line text-slate-light"
          }`}>
            {status === "complete" ? (
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            ) : number}
          </div>
          <div>
            <h3 className="font-display font-semibold text-[16px] text-ink mb-1">{title}</h3>
            <p className="text-[13.5px] text-slate leading-relaxed">{description}</p>
          </div>
        </div>
        {action && status !== "locked" && (
          <button onClick={onClick} className={`flex-shrink-0 px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all ${
            status === "complete"
              ? "border border-line text-slate hover:text-indigo hover:border-indigo"
              : "bg-indigo text-white hover:-translate-y-0.5 shadow-[0_4px_12px_rgba(91,75,255,0.3)]"
          }`}>{action}</button>
        )}
      </div>
    </div>
  );
}

function TrialBadge({ daysLeft, repliesUsed }: { daysLeft: number; repliesUsed: number }) {
  return (
    <div className="rounded-[20px] border border-sky/30 bg-sky/5 p-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-sky mb-1 block">Free trial active</span>
          <p className="font-display font-semibold text-[22px] text-ink">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining</p>
          <p className="text-[13px] text-slate mt-1">{repliesUsed} of 50 daily replies used today</p>
        </div>
        <a href="/onboard" className="px-5 py-2.5 rounded-[11px] text-[14px] font-semibold text-white bg-grad shadow-[0_4px_14px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all">
          Upgrade plan
        </a>
      </div>
      <div className="mt-4 h-1.5 bg-line rounded-full overflow-hidden">
        <div className="h-full bg-grad rounded-full transition-all" style={{ width: `${Math.max(5, (1 - daysLeft / 7) * 100)}%` }} />
      </div>
    </div>
  );
}

function ResponseTimeWidget({ avgSeconds }: { avgSeconds: number | null }) {
  if (avgSeconds === null) return null;
  const hours = Math.floor(avgSeconds / 3600);
  const minutes = Math.floor((avgSeconds % 3600) / 60);
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const score = avgSeconds < 1800 ? "Excellent" : avgSeconds < 7200 ? "Good" : avgSeconds < 86400 ? "Fair" : "Slow";
  const color = avgSeconds < 1800 ? "text-grass" : avgSeconds < 7200 ? "text-amber" : avgSeconds < 86400 ? "text-amber" : "text-rose";
  return (
    <div className="rounded-[16px] border border-line bg-cloud p-5 mb-8">
      <p className="text-[11px] font-mono tracking-[0.1em] uppercase text-slate-light mb-2">Avg response time</p>
      <p className="font-display font-semibold text-[28px] text-ink">{label}</p>
      <p className={`text-[13px] font-medium mt-1 ${color}`}>{score}</p>
    </div>
  );
}

function InlineEditor({ profile, onSave, onCancel }: {
  profile: any;
  onSave: (updated: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    role: profile?.role || "",
    linkedin_url: profile?.linkedin_url || "",
    voice_tone: profile?.voice_tone || TONES[0],
    voice_signoff: profile?.voice_signoff || "",
    voice_rules: profile?.voice_rules || "",
    sample1: profile?.sample_replies?.[0] || "",
    sample2: profile?.sample_replies?.[1] || "",
    sample3: profile?.sample_replies?.[2] || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.role.trim()) {
      setError("Name and role are required.");
      return;
    }
    setSaving(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const samples = [form.sample1, form.sample2, form.sample3].filter(Boolean);
    const { error: err } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        role: form.role.trim(),
        linkedin_url: form.linkedin_url.trim(),
        voice_tone: form.voice_tone,
        voice_signoff: form.voice_signoff.trim(),
        voice_rules: form.voice_rules.trim(),
        sample_replies: samples,
      })
      .eq("auth_user_id", session.user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave({ ...profile, full_name: form.full_name.trim(), role: form.role.trim(), linkedin_url: form.linkedin_url.trim(), voice_tone: form.voice_tone, voice_signoff: form.voice_signoff.trim(), voice_rules: form.voice_rules.trim(), sample_replies: samples });
  };

  const inputClass = "w-full bg-mist border border-line rounded-[12px] px-4 py-2.5 text-ink text-[14px] placeholder:text-slate-light focus:outline-none focus:ring-2 focus:ring-indigo/40";
  const labelClass = "block text-[12px] font-mono tracking-wide uppercase text-slate-light mb-1.5";

  return (
    <div className="border border-indigo/20 bg-indigo/[0.03] rounded-[20px] p-6 mt-4">
      <h3 className="font-display font-semibold text-[15px] text-ink mb-5">Edit profile</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Your full name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <input type="text" value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Founder at Zyntask" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input type="text" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/yourprofile" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Tone</label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map((t) => (
              <button key={t} onClick={() => set("voice_tone", t)} className={`px-4 py-2.5 rounded-[10px] text-[13px] font-medium border transition-all text-left ${
                form.voice_tone === t ? "border-indigo/50 bg-indigo/10 text-indigo" : "border-line bg-cloud text-slate hover:border-indigo/30"
              }`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Sign-off</label>
            <input type="text" value={form.voice_signoff} onChange={(e) => set("voice_signoff", e.target.value)} placeholder="e.g. - Sushrut" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Voice rules <span className="text-slate-light/50 normal-case">(optional)</span></label>
            <input type="text" value={form.voice_rules} onChange={(e) => set("voice_rules", e.target.value)} placeholder="Keep replies under 3 sentences" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Writing samples <span className="text-slate-light/50 normal-case">(optional)</span></label>
          <p className="text-[12px] text-slate mb-2">Paste real examples of how you write - DMs, replies, emails. This makes your agent sound like you.</p>
          {[1, 2, 3].map((n) => (
            <textarea key={n} value={form[`sample${n}` as keyof typeof form]} onChange={(e) => set(`sample${n}`, e.target.value)}
              placeholder={`Example reply ${n}...`} rows={2}
              className="w-full bg-mist border border-line rounded-[12px] px-4 py-2.5 text-ink text-[14px] placeholder:text-slate-light focus:outline-none focus:ring-2 focus:ring-indigo/40 resize-none mb-2"
            />
          ))}
        </div>

        {error && <p className="text-rose text-[13px]">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-[11px] text-[14px] font-semibold text-white bg-grad hover:-translate-y-0.5 transition-all disabled:opacity-50">
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button onClick={onCancel} className="px-6 py-2.5 rounded-[11px] text-[14px] text-slate hover:text-ink border border-line transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [avgResponseSeconds, setAvgResponseSeconds] = useState<number | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialError, setTrialError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }
      const [{ data: prof }, { data: cl }] = await Promise.all([
        supabase.from("profiles").select("*").eq("auth_user_id", session.user.id).single(),
        supabase.from("clients").select("*").eq("auth_user_id", session.user.id).single(),
      ]);
      setProfile(prof);
      setClient(cl);
      if (cl) {
        const { data: rt } = await supabase
          .from("response_times").select("seconds_elapsed")
          .eq("auth_user_id", session.user.id)
          .order("created_at", { ascending: false }).limit(20);
        if (rt && rt.length > 0) {
          const avg = rt.reduce((sum: number, r: any) => sum + r.seconds_elapsed, 0) / rt.length;
          setAvgResponseSeconds(Math.round(avg));
        }
      }
      setLoading(false);
    };
    init();
  }, [router]);

  const handleStartTrial = async () => {
    setStartingTrial(true);
    setTrialError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }
      const res = await fetch("/api/start-trial", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) { setTrialError(result.error || "Failed to start trial."); return; }
      const { data: cl } = await supabase.from("clients").select("*").eq("auth_user_id", session.user.id).single();
      setClient(cl);
    } catch (e: any) {
      setTrialError(e.message || "Something went wrong.");
    } finally {
      setStartingTrial(false);
    }
  };

  const handleProfileSaved = (updated: any) => {
    setProfile(updated);
    setEditOpen(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-mist">
        <SiteNav />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-6 h-6 border-2 border-indigo border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  const setupComplete = profile && profile.role && profile.voice_tone;
  const linkedinConnected = client && client.unipile_account_id;
  const hasPlan = client && (client.status === "trial" || client.status === "active");
  const trialDaysLeft = client?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(client.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <main className="min-h-screen bg-mist">
      <SiteNav />
      <div className="max-w-2xl mx-auto px-6 py-14">

        <div className="mb-10">
          <h1 className="font-display font-bold text-[28px] text-ink mb-1">
            {profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}.` : "Your account"}
          </h1>
          <p className="text-slate text-[15px]">Manage your Engage setup and profile.</p>
        </div>

        {client?.status === "trial" && (
          <TrialBadge daysLeft={trialDaysLeft} repliesUsed={client.trial_replies_used ?? 0} />
        )}

        <ResponseTimeWidget avgSeconds={avgResponseSeconds} />

        <div className="space-y-4 mb-10">
          <StepCard
            number="1" title="Set up your voice profile"
            description="Tell us your role, tone, and how you write. This is what makes Engage sound like you."
            status={setupComplete ? "complete" : "current"}
            action={setupComplete ? "Edit" : "Start setup"}
            onClick={() => setEditOpen(true)}
          />

          <StepCard
            number="2" title="Connect your LinkedIn"
            description="Securely link your LinkedIn account so Engage can monitor your DMs and comments."
            status={!setupComplete ? "locked" : linkedinConnected ? "complete" : "current"}
            action={linkedinConnected ? "Reconnect" : "Connect LinkedIn"}
            onClick={() => router.push("/setup/linkedin")}
          />

          <StepCard
            number="3" title="Start your free trial"
            description="One week free, up to 50 replies a day. No card required. Cancel anytime."
            status={!setupComplete || !linkedinConnected ? "locked" : hasPlan ? "complete" : "current"}
            action={hasPlan ? (client.status === "trial" ? "Upgrade" : "Manage plan") : "Start free trial"}
            onClick={hasPlan ? () => router.push("/onboard") : handleStartTrial}
          />
        </div>

        {trialError && <p className="text-rose text-[13px] text-center mb-6">{trialError}</p>}
        {startingTrial && (
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 text-slate text-[13px]">
              <div className="w-4 h-4 border-2 border-indigo border-t-transparent rounded-full animate-spin" />
              Starting your trial...
            </div>
          </div>
        )}

        <div className="border-t border-line pt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-[16px] text-ink">Profile details</h2>
            {!editOpen && (
              <button onClick={() => setEditOpen(true)} className="text-[13px] text-indigo hover:underline">
                Edit profile
              </button>
            )}
          </div>

          {!editOpen && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Name", value: profile?.full_name },
                { label: "Role", value: profile?.role },
                { label: "Tone", value: profile?.voice_tone },
                { label: "Sign-off", value: profile?.voice_signoff || "Not set" },
                { label: "LinkedIn", value: profile?.linkedin_url ? "Provided" : "Not set" },
                { label: "Samples", value: profile?.sample_replies?.length ? `${profile.sample_replies.length} added` : "None added" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-cloud border border-line rounded-[14px] px-4 py-3">
                  <p className="text-[11px] text-slate-light font-mono tracking-wide uppercase mb-1">{label}</p>
                  <p className="text-[14px] text-ink font-medium truncate">{value || "-"}</p>
                </div>
              ))}
            </div>
          )}

          {editOpen && (
            <InlineEditor
              profile={profile}
              onSave={handleProfileSaved}
              onCancel={() => setEditOpen(false)}
            />
          )}
        </div>

        <div className="border-t border-line pt-8 mt-8 flex items-center justify-between">
          <button
            onClick={() => supabase.auth.signOut().then(() => router.replace("/"))}
            className="text-[13px] text-slate hover:text-rose transition-colors"
          >
            Sign out
          </button>
          {client?.status === "active" && (
            <button className="text-[13px] text-slate-light hover:text-rose transition-colors">
              Cancel subscription
            </button>
          )}
        </div>
      </div>

      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-2.5 rounded-xl text-sm shadow-zy-lg border border-white/10">
          Profile saved successfully
        </div>
      )}
    </main>
  );
}
