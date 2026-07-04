"use client";
export const dynamic = "force-dynamic";

import ZyntaskMark from "../components/ZyntaskMark";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "../components/SiteNav";
import { supabase } from "../lib/supabase";

export default function WelcomePage() {
  const router = useRouter();
  const [hasClient, setHasClient] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }
      const [{ data: prof }, { data: cl }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("auth_user_id", session.user.id).maybeSingle(),
        supabase.from("clients").select("id").eq("auth_user_id", session.user.id).maybeSingle(),
      ]);
      if (prof?.full_name) setName(prof.full_name.split(" ")[0]);
      if (cl) setHasClient(true);
      setLoading(false);
    };
    init();
  }, [router]);

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

  // Engage users get a real explainer before their first dashboard visit
  if (hasClient) {
    return (
      <main className="min-h-screen bg-mist overflow-x-hidden">
        <div className="aurora-field" />
        <div className="relative z-10">
          <SiteNav />
          <div className="max-w-lg mx-auto px-6 pt-24 pb-20">
            <div className="text-center mb-10">
              <div className="flex items-center justify-center mb-6"><ZyntaskMark size={64} /></div>
              <h1 className="font-display font-bold text-[clamp(26px,5vw,36px)] text-ink tracking-tight mb-3">
                {name ? `You are set, ${name}.` : "You are set."}
              </h1>
              <p className="text-slate text-[15.5px] max-w-[40ch] mx-auto leading-relaxed">
                Here is how Engage works, in three parts.
              </p>
            </div>

            <div className="space-y-3 mb-9">
              <div className="bg-white border border-line rounded-2xl p-5 flex gap-4">
                <div className="w-9 h-9 rounded-full bg-grad flex items-center justify-center flex-shrink-0 font-serif italic text-white text-[15px]">1</div>
                <div>
                  <h3 className="font-semibold text-[15px] text-ink mb-1">Engage drafts for you</h3>
                  <p className="text-[13.5px] text-slate leading-relaxed">Every reply and every post idea shows up already written, in your voice. You never start from a blank page.</p>
                </div>
              </div>
              <div className="bg-white border border-line rounded-2xl p-5 flex gap-4">
                <div className="w-9 h-9 rounded-full bg-grad flex items-center justify-center flex-shrink-0 font-serif italic text-white text-[15px]">2</div>
                <div>
                  <h3 className="font-semibold text-[15px] text-ink mb-1">You approve, edit, or skip</h3>
                  <p className="text-[13.5px] text-slate leading-relaxed">Everything waits in your queue. Nothing is ever sent or posted without you reading it first. That never changes.</p>
                </div>
              </div>
              <div className="bg-white border border-line rounded-2xl p-5 flex gap-4">
                <div className="w-9 h-9 rounded-full bg-grad flex items-center justify-center flex-shrink-0 font-serif italic text-white text-[15px]">3</div>
                <div>
                  <h3 className="font-semibold text-[15px] text-ink mb-1">It learns your voice over time</h3>
                  <p className="text-[13.5px] text-slate leading-relaxed">Every edit you make sharpens future drafts. Check the Voice page anytime to see what it has learned.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full px-8 py-4 rounded-[14px] text-[15px] font-semibold text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all"
            >
              Open my queue
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Non-Engage users (e.g. Appraisal Writer only) get the original generic welcome
  return (
    <main className="min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-lg mx-auto px-6 pt-28 pb-20 text-center">
          <div className="flex items-center justify-center mb-7"><ZyntaskMark size={64} /></div>
          <h1 className="font-display font-bold text-[clamp(28px,5vw,40px)] text-ink tracking-tight mb-3">
            {name ? `Welcome, ${name}.` : "Welcome to Zyntask."}
          </h1>
          <p className="text-slate text-[16px] max-w-[38ch] mx-auto mb-10 leading-relaxed">
            Your account is ready. Complete your profile to make every Zyntask tool sound like you, or jump straight in.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/account")}
              className="w-full px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all"
            >
              Complete your profile
            </button>
            <button
              onClick={() => router.push("/")}
              className="w-full px-8 py-3.5 rounded-[13px] text-[15px] text-slate hover:text-ink transition-colors"
            >
              Back to home
            </button>
          </div>
          <p className="text-[12px] text-slate-light mt-8">
            Sign out is available in account settings.
          </p>
        </div>
      </div>
    </main>
  );
}
