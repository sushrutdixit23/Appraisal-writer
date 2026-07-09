"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

export default function ConnectSuccessPage() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

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
        router.replace("/setup?step=3");
        return;
      }

      attempts++;
      if (attempts < 15) {
        setTimeout(poll, 2000);
      } else {
        setTimedOut(true);
      }
    };
    poll();
  }, [router]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {!timedOut ? (
          <>
            <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-indigo animate-spin mx-auto mb-7" />
            <h1 className="font-serif font-semibold text-2xl text-white mb-3">Finishing setup...</h1>
            <p className="text-slate-light text-[14.5px]">Your LinkedIn is connecting. This takes a few seconds.</p>
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
