"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteNav from "../../components/SiteNav";
import { supabase } from "../../lib/supabase";

export default function LinkedInSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const status = searchParams.get("linkedin");
    if (status === "connected") setConnected(true);
    if (status === "failed") setError("LinkedIn connection failed. Please try again.");

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }
      const { data: client } = await supabase
        .from("clients")
        .select("unipile_account_id")
        .eq("auth_user_id", session.user.id)
        .single();
      if (client?.unipile_account_id) setConnected(true);
      setChecking(false);
    };
    check();
  }, [router, searchParams]);

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }
      const res = await fetch("/api/linkedin-connect", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (!res.ok || !result.url) {
        setError(result.error || "Failed to generate connect link.");
        setLoading(false);
        return;
      }
      window.location.href = result.url;
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setLoading(false);
    }
  };

  if (checking) {
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
    <main className="min-h-screen bg-mist">
      <SiteNav />
      <div className="max-w-md mx-auto px-6 py-20 text-center">

        {connected ? (
          <>
            <div className="w-16 h-16 rounded-full bg-grass/10 border border-grass/30 flex items-center justify-center mx-auto mb-6">
              <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-grass stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10.5 8.5 15 16 5.5" />
              </svg>
            </div>
            <h1 className="font-display font-bold text-[26px] text-ink mb-3">LinkedIn connected</h1>
            <p className="text-slate text-[15px] mb-8 leading-relaxed">
              Engage can now monitor your DMs and comments. Head back to your account to start your free trial.
            </p>
            <button
              onClick={() => router.push("/account")}
              className="px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all"
            >
              Back to account
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-[18px] bg-[#0A66C2] flex items-center justify-center mx-auto mb-6 shadow-[0_8px_24px_rgba(10,102,194,0.35)]">
              <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <h1 className="font-display font-bold text-[26px] text-ink mb-3">Connect your LinkedIn</h1>
            <p className="text-slate text-[15px] mb-2 leading-relaxed">
              You'll be taken to a secure page to log in to LinkedIn. Engage will never post, message, or take any action without your approval.
            </p>
            <p className="text-[13px] text-slate-light mb-8">
              Your credentials are handled by Unipile and never stored by Zyntask.
            </p>

            {error && (
              <p className="text-rose text-[13px] mb-4">{error}</p>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full px-8 py-3.5 rounded-[13px] text-[15px] font-semibold text-white bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {loading ? "Generating secure link..." : "Connect LinkedIn"}
            </button>

            <button
              onClick={() => router.push("/account")}
              className="mt-4 text-[13px] text-slate hover:text-ink transition-colors"
            >
              Back to account
            </button>
          </>
        )}
      </div>
    </main>
  );
}
