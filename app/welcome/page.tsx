"use client";
export const dynamic = "force-dynamic";
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

  return (
    <main className="min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-lg mx-auto px-6 pt-28 pb-20 text-center">

          <div className="w-16 h-16 rounded-[20px] bg-grad flex items-center justify-center mx-auto mb-7 shadow-[0_8px_28px_rgba(91,75,255,0.35)]">
            <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5 8.5 15 16 5.5" />
            </svg>
          </div>

          <h1 className="font-display font-bold text-[clamp(28px,5vw,40px)] text-ink tracking-tight mb-3">
            {name ? `Welcome, ${name}.` : "Welcome to Zyntask."}
          </h1>
          <p className="text-slate text-[16px] max-w-[38ch] mx-auto mb-10 leading-relaxed">
            You are in. Set up Engage to start monitoring your LinkedIn - or head straight to the dashboard if you are already set up.
          </p>

          <div className="flex flex-col gap-3">
            {hasClient && (
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all"
              >
                Go to dashboard
              </button>
            )}
            <button
              onClick={() => router.push("/account")}
              className={`w-full px-8 py-3.5 rounded-[13px] text-[15px] font-semibold transition-all ${
                hasClient
                  ? "border border-line text-ink hover:border-indigo hover:text-indigo"
                  : "text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5"
              }`}
            >
              {hasClient ? "Account settings" : "Set up Engage"}
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
