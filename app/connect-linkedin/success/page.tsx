"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

export default function ConnectSuccessPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

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
        setReady(true);
        setChecking(false);
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

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {checking ? (
          <>
            <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-indigo animate-spin mx-auto mb-7" />
            <h1 className="font-serif font-semibold text-2xl text-white mb-3">Finishing setup...</h1>
            <p className="text-slate-light text-[14.5px]">Your LinkedIn is connecting. This takes a few seconds.</p>
          </>
        ) : ready ? (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-7" style={{ background: ACCENT }}>
              <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            </div>
            <h1 className="font-serif font-semibold text-3xl text-white mb-3">You are connected.</h1>
            <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-9">
              Your free trial has started. One week, full access, no payment.
            </p>
            <button
              onClick={() => router.push("/welcome")}
              className="w-full py-4 rounded-[14px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
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
