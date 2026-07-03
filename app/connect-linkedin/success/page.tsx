"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

const WARMING_MESSAGES = [
  "Reading your recent messages...",
  "Checking your latest comments...",
  "Drafting your first replies in your voice...",
  "Almost there...",
];

export default function ConnectSuccessPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [clientReady, setClientReady] = useState(false);
  const [warming, setWarming] = useState(false);
  const [hasQueue, setHasQueue] = useState(false);
  const [messageIdx, setMessageIdx] = useState(0);

  // Step 1: poll until the clients row exists (LinkedIn account connected)
  useEffect(() => {
    let attempts = 0;
    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }

      const { data: client } = await supabase
        .from("clients")
        .select("id, unipile_account_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (client?.unipile_account_id) {
        setClientReady(true);
        setChecking(false);
        setWarming(true);
        return;
      }

      attempts++;
      if (attempts < 15) {
        setTimeout(poll, 2000);
      } else {
        setChecking(false);
      }
    };
    poll();
  }, [router]);

  // Step 2: once connected, poll for the first interaction to land (orchestrator picks up within ~2 min)
  useEffect(() => {
    if (!warming) return;
    let attempts = 0;
    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
          setHasQueue(true);
          setWarming(false);
          return;
        }
      }

      attempts++;
      // Poll for up to ~2.5 minutes, matching the orchestrator's 2-minute cycle plus buffer
      if (attempts < 50) {
        setTimeout(poll, 3000);
      } else {
        // Give up waiting visibly - let them go to the dashboard anyway, it will populate shortly
        setWarming(false);
      }
    };
    poll();
  }, [warming]);

  // Cycle through reassuring messages while warming
  useEffect(() => {
    if (!warming) return;
    const interval = setInterval(() => {
      setMessageIdx((i) => (i + 1) % WARMING_MESSAGES.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [warming]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {checking ? (
          <>
            <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-indigo animate-spin mx-auto mb-7" />
            <h1 className="font-serif font-semibold text-2xl text-white mb-3">Finishing setup...</h1>
            <p className="text-slate-light text-[14.5px]">Your LinkedIn is connecting. This takes a few seconds.</p>
          </>
        ) : warming ? (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-7 relative" style={{ background: ACCENT }}>
              <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: ACCENT }} />
              <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-white stroke-[2.5] fill-none relative" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            </div>
            <h1 className="font-serif font-semibold text-3xl text-white mb-3">You are connected.</h1>
            <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-8">
              Your free trial has started. Engage is reading your account for the first time now.
            </p>
            <div className="bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <p className="text-[13.5px] text-white/80 text-left transition-opacity duration-300">
                  {WARMING_MESSAGES[messageIdx]}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/welcome")}
              className="text-[13px] text-slate-light hover:text-white transition-colors underline underline-offset-4"
            >
              I will check back later
            </button>
          </>
        ) : hasQueue ? (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-7" style={{ background: ACCENT }}>
              <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            </div>
            <h1 className="font-serif font-semibold text-3xl text-white mb-3">Your queue is ready.</h1>
            <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-9">
              Engage has drafted your first replies. Come see what is waiting for you.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-4 rounded-[14px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
              style={{ background: ACCENT }}
            >
              Open my dashboard
            </button>
          </>
        ) : clientReady ? (
          <>
            <h1 className="font-serif font-semibold text-2xl text-white mb-3">You are all set.</h1>
            <p className="text-slate-light text-[14.5px] mb-7 leading-relaxed max-w-[38ch] mx-auto">
              Engage is still reading your account. Your queue will fill in shortly. You can head to your dashboard now or check back in a couple of minutes.
            </p>
            <button
              onClick={() => router.push("/welcome")}
              className="px-7 py-3 rounded-xl text-[14px] font-semibold text-white"
              style={{ background: ACCENT }}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <h1 className="font-serif font-semibold text-2xl text-white mb-3">Still connecting...</h1>
            <p className="text-slate-light text-[14.5px] mb-7">This is taking longer than expected. You can refresh this page, or contact us if it does not finish.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-7 py-3 rounded-xl text-[14px] font-semibold text-white"
              style={{ background: ACCENT }}
            >
              Refresh
            </button>
          </>
        )}
      </div>
    </main>
  );
}
