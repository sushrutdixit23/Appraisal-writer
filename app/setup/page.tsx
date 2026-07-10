"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import ZyntaskMarkProgress from "../components/ZyntaskMarkProgress";
import ZyntaskLoader from "../components/ZyntaskLoader";
import CommentTargets from "../components/CommentTargets";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

const TONE_OPTIONS = ["Professional", "Founder", "Consultant", "Executive", "Friendly", "Technical"];

const CALIBRATION_MESSAGES = [
  "Learning vocabulary...",
  "Understanding sentence rhythm...",
  "Building your writing profile...",
  "Preparing your approval workflow...",
  "Almost ready...",
];

function ringsForStep(step: number) {
  if (step >= 7) return 3;
  if (step >= 5) return 2;
  if (step >= 3) return 1;
  return 0;
}

export default function SetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [about, setAbout] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<string[]>([]);

  // Screen 4 - tone
  const [selectedTones, setSelectedTones] = useState<string[]>([]);

  // Screen 5 - rules
  const [rules, setRules] = useState("");

  // Screen 6 - samples
  const [samples, setSamples] = useState<string[]>(["", "", ""]);
  const [samplesSeeded, setSamplesSeeded] = useState(false);

  // Screen 8 - calibration
  const [calibrationMsgIdx, setCalibrationMsgIdx] = useState(0);
  const [calibrationError, setCalibrationError] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }

      const metaName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || "";
      if (metaName) setFullName(metaName);

      const stepParam = searchParams.get("step");
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (stepParam) {
        setStep(parseInt(stepParam, 10));
      } else if (existingProfile) {
        setStep(2);
      } else {
        setStep(1);
      }

      setLoading(false);
    };
    init();
  }, [router, searchParams]);

  useEffect(() => {
    if (step !== 3) return;
    const runImport = async () => {
      setImporting(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/import-linkedin-profile", {
          method: "POST",
          headers: { "Authorization": `Bearer ${session?.access_token}` },
        });
        const result = await res.json();
        if (res.ok) {
          setAbout(result.about || null);
          setRecentPosts(result.recentPosts || []);
        }
      } catch { /* non-fatal */ }
      finally { setImporting(false); }
    };
    runImport();
  }, [step]);

  // Seed samples from imported posts once, when first reaching step 6
  useEffect(() => {
    if (step === 6 && !samplesSeeded && recentPosts.length > 0) {
      const seeded = [0, 1, 2].map((i) => recentPosts[i] || "");
      setSamples(seeded);
      setSamplesSeeded(true);
    }
  }, [step, samplesSeeded, recentPosts]);

  // Screen 8 - fire the real profile write, then poll for the first draft
  useEffect(() => {
    if (step !== 8) return;
    let cancelled = false;

    const messageInterval = setInterval(() => {
      setCalibrationMsgIdx((i) => (i + 1) % CALIBRATION_MESSAGES.length);
    }, 2600);

    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const sample_replies = samples.map((s) => s.trim()).filter(Boolean);
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            voice_tone: selectedTones.join(", "),
            voice_rules: rules.trim(),
            sample_replies,
          })
          .eq("auth_user_id", session.user.id);

        if (updateError) throw new Error(updateError.message);

        let attempts = 0;
        const poll = async () => {
          if (cancelled) return;
          const { data: client } = await supabase
            .from("clients")
            .select("id")
            .eq("auth_user_id", session.user.id)
            .maybeSingle();

          if (client) {
            const { count } = await supabase
              .from("interactions")
              .select("id", { count: "exact", head: true })
              .eq("client_id", client.id);
            if (count && count > 0) {
              if (!cancelled) setStep(9);
              return;
            }
          }
          attempts++;
          if (attempts < 50 && !cancelled) {
            setTimeout(poll, 3000);
          } else if (!cancelled) {
            // Give up waiting visibly - let them proceed, queue fills in shortly
            setStep(9);
          }
        };
        poll();
      } catch (e: any) {
        if (!cancelled) setCalibrationError(e.message || "Something went wrong while saving.");
      }
    };
    run();

    return () => { cancelled = true; clearInterval(messageInterval); };
  }, [step]);

  const handleBeginSetup = async () => {
    setError("");
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    if (!role.trim()) { setError("Please enter your role."); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error: insertError } = await supabase.from("profiles").insert({
        auth_user_id: session?.user.id,
        full_name: fullName.trim(),
        role: role.trim(),
        voice_tone: "",
        voice_signoff: "",
        voice_rules: "",
        sample_replies: [],
      });
      if (insertError) throw new Error(insertError.message);
      setStep(2);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleConnectLinkedIn = async () => {
    setError("");
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/connect-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not start connection.");
      window.location.href = result.url;
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setConnecting(false);
    }
  };

  const toggleTone = (tone: string) => {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  };

  const setSample = (i: number, v: string) => {
    setSamples((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <ZyntaskLoader />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink overflow-hidden relative flex items-center justify-center px-6 py-16">
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 30% 20%, rgba(91,75,255,0.14), transparent 50%), radial-gradient(circle at 80% 80%, rgba(138,111,240,0.10), transparent 50%)",
        animation: "onboardBreathe 7s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <style>{`
        @keyframes onboardBreathe { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>

      <div className="relative z-10 w-full max-w-lg">
        <div className="flex justify-center mb-10">
          <ZyntaskMarkProgress size={56} litRings={ringsForStep(step)} corePulse={step === 9} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <div className="font-serif italic text-[13px] text-slate-light mb-7">by <span className="text-white not-italic font-semibold">Zyntask</span></div>
              <h1 className="font-serif font-semibold text-[34px] text-white mb-3">Welcome{fullName ? `, ${fullName.split(" ")[0]}` : ""}.</h1>
              <p className="text-slate-light text-[15px] leading-relaxed max-w-[36ch] mx-auto mb-9">
                Let us set up your professional copilot. This takes about two minutes, and it is the only setup you will ever need to do.
              </p>
              <div className="text-left space-y-4 mb-8 max-w-sm mx-auto">
                <div>
                  <label className="block text-[12px] text-slate-light mb-1.5">Your name</label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Priya Sharma"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo/50" />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-light mb-1.5">Your role</label>
                  <input value={role} onChange={e => setRole(e.target.value)} placeholder="Founder"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo/50" />
                </div>
              </div>
              {error && <p className="text-rose text-[13px] mb-4">{error}</p>}
              <button onClick={handleBeginSetup} disabled={saving}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                {saving ? "Setting up..." : "Begin setup"}
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "#0A66C2" }}>
                <svg viewBox="0 0 24 24" width={26} height={26} fill="white"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.92H5.67v8.42h2.67zM7 8.78a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.56v-4.6c0-2.46-1.31-3.61-3.06-3.61a2.64 2.64 0 0 0-2.39 1.31h-.04V9.92h-2.56v8.42h2.67v-4.16c0-1.1.21-2.16 1.57-2.16 1.34 0 1.36 1.25 1.36 2.23v4.09h2.45z"/></svg>
              </div>
              <h1 className="font-serif font-semibold text-[30px] text-white mb-3">Connect your LinkedIn.</h1>
              <p className="text-slate-light text-[15px] leading-relaxed max-w-[36ch] mx-auto mb-9">
                Secure login through Unipile. Zyntask never sees your password. We will import your profile automatically once connected.
              </p>
              {error && <p className="text-rose text-[13px] mb-4">{error}</p>}
              <button onClick={handleConnectLinkedIn} disabled={connecting}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                {connecting ? "Opening secure connection..." : "Connect with LinkedIn"}
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[28px] text-white mb-2">
                {importing ? "Reading your profile..." : "Imported from LinkedIn."}
              </h1>
              <p className="text-slate-light text-[13.5px] mb-7">You can adjust anything later on your Voice page.</p>
              {importing ? (
                <div className="w-10 h-10 border-2 border-white/10 border-t-indigo rounded-full animate-spin mx-auto my-10" />
              ) : (
                <div className="text-left space-y-3 mb-8 max-w-sm mx-auto">
                  {about && (
                    <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-light mb-1.5">About, imported</p>
                      <p className="text-[13px] text-white/85 leading-relaxed line-clamp-4">{about}</p>
                    </div>
                  )}
                  {recentPosts.length > 0 && (
                    <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-light mb-1.5">{recentPosts.length} recent posts, imported</p>
                      <p className="text-[12.5px] text-white/70 leading-relaxed">Used automatically as writing samples.</p>
                    </div>
                  )}
                  {!about && recentPosts.length === 0 && (
                    <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-5 text-center">
                      <p className="text-[13px] text-white/70">We could not pull much this time - no problem, you can add samples manually next.</p>
                    </div>
                  )}
                </div>
              )}
              {!importing && (
                <button onClick={() => setStep(4)}
                  className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: ACCENT }}>
                  Continue
                </button>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[28px] text-white mb-2">Your communication style.</h1>
              <p className="text-slate-light text-[14px] mb-8">Choose how Engage should sound by default. Pick as many as fit.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-9 max-w-md mx-auto">
                {TONE_OPTIONS.map((tone) => {
                  const active = selectedTones.includes(tone);
                  return (
                    <button
                      key={tone}
                      onClick={() => toggleTone(tone)}
                      className="rounded-xl px-4 py-3 text-[13.5px] font-medium border transition-all"
                      style={active
                        ? { background: "rgba(91,75,255,0.18)", borderColor: "rgba(122,108,255,0.5)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(5)}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                Continue
              </button>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[28px] text-white mb-2">Your non-negotiables.</h1>
              <p className="text-slate-light text-[14px] mb-7 max-w-[38ch] mx-auto">These rules stay with every draft. Optional, but worth a moment.</p>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Never use emojis. Never discuss pricing directly. Always thank people."
                rows={4}
                className="w-full max-w-md mx-auto block bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo/50 resize-none mb-8"
              />
              <button onClick={() => setStep(6)}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                Continue
              </button>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div key="step6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[28px] text-white mb-2">Let us understand your writing.</h1>
              <p className="text-slate-light text-[14px] mb-7 max-w-[40ch] mx-auto">
                {recentPosts.length > 0
                  ? "Pre-filled from your imported posts - edit or replace anything below."
                  : "Paste 1-3 examples that genuinely sound like you."}
              </p>
              <div className="space-y-2.5 max-w-md mx-auto mb-8">
                {[0, 1, 2].map((i) => (
                  <textarea
                    key={i}
                    value={samples[i]}
                    onChange={(e) => setSample(i, e.target.value)}
                    placeholder={`Example ${i + 1}...`}
                    rows={2}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo/50 resize-none"
                  />
                ))}
              </div>
              <button onClick={() => setStep(7)}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                Continue
              </button>
            </motion.div>
          )}

          {step === 7 && (
            <motion.div key="step7" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[28px] text-white mb-2">Stay ready before conversations happen.</h1>
              <p className="text-slate-light text-[14px] mb-7 max-w-[42ch] mx-auto">Add people whose posts matter to your work - a boss, a client, a peer. Optional.</p>
              <div className="max-w-md mx-auto mb-8 text-left">
                <CommentTargets />
              </div>
              <button onClick={() => setStep(8)}
                className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                Continue
              </button>
            </motion.div>
          )}

          {step === 8 && (
            <motion.div key="step8" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <div className="w-14 h-14 rounded-full relative mx-auto mb-8">
                <div style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: "conic-gradient(from 0deg, #5B4BFF, #8a6ff0, #5B4BFF)",
                  animation: "wizardSpin 2.2s linear infinite",
                }} />
                <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#0a0e1f" }} />
              </div>
              <style>{`@keyframes wizardSpin { to { transform: rotate(360deg); } }`}</style>
              <h1 className="font-serif font-semibold text-[24px] text-white mb-2">{CALIBRATION_MESSAGES[calibrationMsgIdx]}</h1>
              {calibrationError ? (
                <p className="text-rose text-[13px] mt-4">{calibrationError}</p>
              ) : (
                <p className="text-slate-light text-[13px] mt-2">This only takes a moment.</p>
              )}
            </motion.div>
          )}

          {step === 9 && (
            <motion.div key="step9" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45 }} className="text-center">
              <h1 className="font-serif font-semibold text-[32px] text-white mb-3">Everything is ready.</h1>
              <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-9">
                Engage now understands how you communicate. It will prepare every draft in your voice. Every decision remains yours.
              </p>
              <button onClick={() => router.push("/dashboard")}
                className="px-8 py-4 rounded-[14px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: ACCENT }}>
                Enter Engage
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
