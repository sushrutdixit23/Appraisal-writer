"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const TONES = [
  "Warm and friendly",
  "Professional and formal",
  "Direct and concise",
  "Casual and conversational",
];

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    role: "",
    linkedin_url: "",
    voice_tone: TONES[0],
    voice_signoff: "",
    voice_rules: "",
    sample1: "",
    sample2: "",
    sample3: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/");
        return;
      }
      setUserId(session.user.id);

      const metaName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || "";
      if (metaName) {
        setForm((f) => ({ ...f, full_name: metaName }));
      }

      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (existing) {
        router.replace("/welcome");
        return;
      }

      setLoading(false);
    };
    init();
  }, [router]);

  const validate = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.role.trim()) return "Role is required.";
    if (!form.voice_signoff.trim()) return "Sign-off is required (e.g. â€” John).";
    return "";
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    const sample_replies = [form.sample1, form.sample2, form.sample3]
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: insertError } = await supabase.from("profiles").insert({
      auth_user_id: userId,
      full_name: form.full_name,
      role: form.role,
      linkedin_url: form.linkedin_url,
      voice_tone: form.voice_tone,
      voice_signoff: form.voice_signoff,
      voice_rules: form.voice_rules,
      sample_replies,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.replace("/welcome");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <p className="text-slate-light text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink overflow-x-hidden">
      <div className="max-w-lg mx-auto px-6 pt-20 pb-20">
        <div className="text-center mb-10">
          <span className="font-display font-bold text-2xl text-white">Zyntask</span>
          <h1 className="font-serif font-semibold text-3xl text-white mt-6 mb-3">
            Set up your profile.
          </h1>
          <p className="text-slate-light text-[15px] leading-relaxed max-w-[40ch] mx-auto">
            This is the foundation for everything in Zyntask. Set it once â€” every tool and agent
            you use will already sound like you.
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">Full name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="Priya Sharma"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
            />
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">Role / headline</label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="Founder"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
            />
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">
              LinkedIn profile URL <span className="text-slate-light/50">(optional)</span>
            </label>
            <input
              type="url"
              value={form.linkedin_url}
              onChange={(e) => set("linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
            />
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">Writing tone</label>
            <select
              value={form.voice_tone}
              onChange={(e) => set("voice_tone", e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo"
            >
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">Sign-off</label>
            <input
              type="text"
              value={form.voice_signoff}
              onChange={(e) => set("voice_signoff", e.target.value)}
              placeholder="e.g. - Priya"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
            />
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-light mb-1.5">
              Voice rules <span className="text-slate-light/50">(optional)</span>
            </label>
            <textarea
              value={form.voice_rules}
              onChange={(e) => set("voice_rules", e.target.value)}
              placeholder="Keep replies under 3 sentences. Never discuss pricing directly."
              rows={2}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo resize-none"
            />
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="text-[12.5px] text-slate-light mb-1">
              Sample replies <span className="text-slate-light/50">(optional, but recommended)</span>
            </p>
            <p className="text-[11.5px] text-slate-light/60 mb-3 leading-relaxed">
              Paste 1-3 examples of how you actually write â€” a LinkedIn reply, a DM, an email.
              This is the single best way to make your agents sound like you.
            </p>
            {[1, 2, 3].map((n) => (
              <textarea
                key={n}
                value={form[`sample${n}` as keyof typeof form]}
                onChange={(e) => set(`sample${n}`, e.target.value)}
                placeholder={`Example reply ${n}...`}
                rows={2}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo resize-none mb-2"
              />
            ))}
          </div>

          {error && <p className="text-rose text-[13px]">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}
          >
            {saving ? "Saving..." : "Complete setup â†’"}
          </button>
        </div>
      </div>
    </main>
  );
}
