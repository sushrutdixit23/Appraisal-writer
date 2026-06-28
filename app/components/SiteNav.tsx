"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const STAR_PATH = "M50 4C50.8 4 53 22 54.5 33C56 44 60 48 71 49.5C82 51 96 50 96 50C96 50 82 49 71 50.5C60 52 56 56 54.5 67C53 78 50.8 96 50 96C49.2 96 47 78 45.5 67C44 56 40 52 29 50.5C18 49 4 50 4 50C4 50 18 51 29 49.5C40 48 44 44 45.5 33C47 22 49.2 4 50 4Z";
const STAR_CUT = "M50 36C50.2 36 51.5 43 52 46C52.5 49 54 50.5 57 51C60 51.5 64 51 64 50C64 49 60 48.5 57 49C54 49.5 52.5 51 52 54C51.5 57 50.2 64 50 64C49.8 64 48.5 57 48 54C47.5 51 46 49.5 43 49C40 48.5 36 49 36 50C36 51 40 51.5 43 51C46 50.5 47.5 49 48 46C48.5 43 49.8 36 50 36Z";

function CreditsChip({ credits }: { credits: number }) {
  return (
    <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo/25" style={{ background: "rgba(91,75,255,0.07)" }}>
      <svg width="14" height="14" viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="navcreditsg" x1="20" y1="0" x2="80" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4A9EFF"/>
            <stop offset="45%" stopColor="#5B4BFF"/>
            <stop offset="100%" stopColor="#7B2FE0"/>
          </linearGradient>
        </defs>
        <path d={STAR_PATH} fill="url(#navcreditsg)"/>
        <path d={STAR_CUT} fill="white"/>
      </svg>
      <span className="font-semibold text-[13px] text-ink tabular-nums">{credits}</span>
    </div>
  );
}

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [tab, setTab] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);
  const [hasClient, setHasClient] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const loadCredits = async (s: { user: { id: string } } | null) => {
      if (!active) return;
      if (!s) { setCredits(null); setSession(null); return; }
      setSession(s);
      const { data: cl } = await supabase.from("clients").select("id").eq("auth_user_id", s.user.id).maybeSingle();
      setHasClient(!!cl);
      try {
        const { data } = await supabase.from("profiles").select("credits").eq("auth_user_id", s.user.id).single();
        if (active && data) setCredits(data.credits);
      } catch { /* ignore */ }
    };
    supabase.auth.getSession().then(({ data: { session: s } }) => loadCredits(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => loadCredits(s));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const links = [
    { href: "/engage", label: "Engage" },
    { href: "/#agents", label: "Agents" },
    { href: "/appraisal-writer", label: "Appraisal Writer" },
  ];
  const dashboardHref = hasClient ? "/dashboard" : "/onboard";

  const handleEmailAuth = async () => {
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: tab === "signup" ? { full_name: name.trim() } : undefined,
      },
    });
    if (error) { setStatus("error"); setErrorMsg(error.message); }
    else setStatus("sent");
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setStatus("idle");
    setEmail("");
    setName("");
    setErrorMsg("");
  };

  const btn = "font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]";

  return (
    <>
      <nav className={`sticky top-0 z-50 transition-all duration-300 relative ${scrolled ? "backdrop-blur-xl bg-white/70 shadow-[0_8px_28px_rgba(13,13,13,0.08)]" : "backdrop-blur-md bg-white/45"}`}>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo/35 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 h-[70px] flex items-center justify-between">
          <a href="/" className="group flex items-center gap-2.5 font-display font-bold text-xl text-ink">
            <span className="w-7.5 h-7.5 rounded-[9px] bg-grad flex items-center justify-center shadow-zy-sm transition-shadow duration-300 group-hover:shadow-[0_0_18px_rgba(91,75,255,0.55)]">
              <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-white stroke-[2.6] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            </span>
            Zyntask
          </a>
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="text-[15px] font-medium text-ink-soft hover:text-indigo transition-colors">{l.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {session && credits !== null && <CreditsChip credits={credits} />}
            {session && (
              <div className="relative hidden md:block">
                <button onClick={() => setSettingsOpen(!settingsOpen)} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-[11px] text-[14px] text-ink-soft border border-line hover:text-indigo hover:border-indigo ${btn}`}>
                  <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[1.8] fill-none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="7" r="3.5" />
                    <path d="M2.5 17.5c0-3.314 3.358-6 7.5-6s7.5 2.686 7.5 6" />
                  </svg>
                  Settings
                  <svg viewBox="0 0 20 20" className={`w-3.5 h-3.5 stroke-current stroke-[2] fill-none transition-transform ${settingsOpen ? "rotate-180" : ""}`} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-cloud border border-line rounded-[14px] shadow-zy-lg overflow-hidden z-50" onClick={() => setSettingsOpen(false)}>
                    <a href="/account" className="flex items-center gap-2.5 px-4 py-3 text-[14px] text-ink hover:bg-mist transition-colors">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[1.8] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10" cy="7" r="3.5" />
                        <path d="M2.5 17.5c0-3.314 3.358-6 7.5-6s7.5 2.686 7.5 6" />
                      </svg>
                      Profile settings
                    </a>
                    <div className="h-px bg-line mx-3" />
                    <button onClick={() => supabase.auth.signOut().then(() => window.location.href = "/")} className="w-full flex items-center gap-2.5 px-4 py-3 text-[14px] text-rose hover:bg-mist transition-colors">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[1.8] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 3h4v14h-4M8 14l4-4-4-4M12 10H3" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
            {session && (
              <a href={dashboardHref} className={`hidden md:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[11px] text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5 ${btn}`} style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
                Dashboard
              </a>
            )}
            {!session && (
              <button onClick={() => { setAuthOpen(true); setTab("signup"); }} className={`hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[14px] text-ink-soft border border-line hover:text-indigo hover:border-indigo ${btn}`}>
                <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-current stroke-[1.8] fill-none" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="7" r="3.5" />
                  <path d="M2.5 17.5c0-3.314 3.358-6 7.5-6s7.5 2.686 7.5 6" />
                </svg>
                Sign in
              </button>
            )}
            <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} className="md:hidden flex flex-col gap-[5px] p-2">
              <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>
        <div className={`md:hidden border-t border-line bg-white/80 backdrop-blur-xl overflow-hidden transition-all duration-300 ${open ? "max-h-[400px]" : "max-h-0"}`}>
          <div className="px-6 py-5 flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-3 text-[16px] font-medium text-ink-soft hover:text-indigo transition-colors border-b border-line-soft last:border-0">{l.label}</a>
            ))}
            {!session && (
              <button onClick={() => { setOpen(false); setAuthOpen(true); setTab("signup"); }} className={`mt-4 inline-flex justify-center items-center gap-2 px-5 py-3 rounded-[11px] text-[15px] text-ink border border-line ${btn}`}>Sign in</button>
            )}
            {session && (
              <a href="/account" onClick={() => setOpen(false)} className={`mt-4 inline-flex justify-center px-5 py-3 rounded-[11px] text-[15px] text-ink border border-line ${btn}`}>Profile settings</a>
            )}
            {session && (
              <a href={dashboardHref} onClick={() => setOpen(false)} className={`mt-2.5 inline-flex justify-center px-5 py-3 rounded-[11px] text-[15px] bg-ink text-white ${btn}`}>Dashboard</a>
            )}
            {session && (
              <button onClick={() => supabase.auth.signOut().then(() => window.location.href = "/")} className={`mt-2.5 inline-flex justify-center px-5 py-3 rounded-[11px] text-[15px] text-rose border border-line ${btn}`}>Sign out</button>
            )}
          </div>
        </div>
      </nav>

      {authOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end px-4 pt-[72px]" onClick={closeAuth}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-cloud border border-line rounded-[24px] p-7 shadow-zy-lg" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeAuth} className="absolute top-4 right-4 text-slate hover:text-ink transition-colors">
              <svg viewBox="0 0 20 20" className="w-5 h-5 stroke-current stroke-[2] fill-none" strokeLinecap="round"><path d="M5 5l10 10M15 5l-10 10" /></svg>
            </button>
            <div className="text-center mb-6"><span className="font-display font-bold text-xl text-ink">Zyntask</span></div>
            <div className="flex bg-mist border border-line rounded-xl p-1 mb-6">
              {(["signup", "signin"] as const).map((t) => (
                <button key={t} onClick={() => { setTab(t); setStatus("idle"); setErrorMsg(""); }} className="flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all" style={tab === t ? { background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)", color: "#fff" } : { color: "#6b6880" }}>
                  {t === "signup" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>
            {status === "sent" ? (
              <div className="text-center py-4">
                <p className="text-ink font-medium mb-1">Check your email</p>
                <p className="text-slate text-sm">We sent a link to {email}. Click it to continue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <button onClick={handleGoogle} className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-line bg-white hover:bg-mist text-[14px] text-ink ${btn}`}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-line" /><span className="text-[11px] text-slate">or</span><div className="flex-1 h-px bg-line" />
                </div>
                {tab === "signup" && (
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-ink text-sm placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-indigo" />
                )}
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()} placeholder="your@email.com" className="w-full bg-mist border border-line rounded-xl px-4 py-3 text-ink text-sm placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-indigo" />
                {errorMsg && <p className="text-rose text-[12px]">{errorMsg}</p>}
                <button onClick={handleEmailAuth} disabled={status === "sending"} className={`w-full py-3 rounded-xl text-[14px] text-white disabled:opacity-50 disabled:hover:scale-100 ${btn}`} style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
                  {status === "sending" ? "Sending..." : tab === "signup" ? "Create account" : "Send sign-in link"}
                </button>
                {tab === "signup" && (
                  <p className="text-[11.5px] text-slate text-center leading-relaxed">Already have an account? <button onClick={() => setTab("signin")} className="text-indigo hover:underline font-medium">Sign in</button></p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

