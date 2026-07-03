"use client";
export const dynamic = "force-dynamic";

import ZyntaskLoader from "../components/ZyntaskLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

export default function ConnectLinkedInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/"); return; }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!profileData) { router.replace("/setup"); return; }
      setFullName(profileData.full_name?.split(" ")[0] || "");
      setLoading(false);
    };
    init();
  }, [router]);

  const handleConnect = async () => {
    setError("");
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/connect-linkedin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not start connection.");
      window.location.href = result.url;
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <ZyntaskLoader />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-7" style={{ background: ACCENT }}>
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.92H5.67v8.42h2.67zM7 8.78a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.56v-4.6c0-2.46-1.31-3.61-3.06-3.61a2.64 2.64 0 0 0-2.39 1.31h-.04V9.92h-2.56v8.42h2.67v-4.16c0-1.1.21-2.16 1.57-2.16 1.34 0 1.36 1.25 1.36 2.23v4.09h2.45z"/>
          </svg>
        </div>
        <h1 className="font-serif font-semibold text-3xl text-white mb-3">
          Connect your LinkedIn{fullName ? `, ${fullName}` : ""}.
        </h1>
        <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-9">
          Engage needs access to read your messages and comments, and to post on your behalf with your approval. Your login is handled securely by Unipile - Zyntask never sees your password.
        </p>

        {error && (
          <p className="text-rose text-[13px] mb-5">{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full py-4 rounded-[14px] text-[15px] font-semibold text-white disabled:opacity-50 transition-all hover:opacity-90"
          style={{ background: ACCENT }}
        >
          {connecting ? "Opening secure connection..." : "Connect with LinkedIn"}
        </button>

        <p className="text-[12px] text-slate-light mt-6 leading-relaxed">
          You will be redirected to a secure Unipile page to log in. Nothing is posted or sent until you set up your trial and approve it yourself.
        </p>
      </div>
    </main>
  );
}
