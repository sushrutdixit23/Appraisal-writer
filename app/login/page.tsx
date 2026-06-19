"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL); // ADD THIS
  
   const { error } = await supabase.auth.signInWithOtp({
     email: email.trim(),
     options: {
       emailRedirectTo: `${window.location.origin}/auth/callback`,
     },
   });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-serif font-semibold text-[44px] text-white tracking-tight leading-none mb-2">
            Engage<span style={{ color: "#8a6ff0" }}>.</span>
          </h1>
          <p className="text-slate-light text-sm">Sign in to your dashboard</p>
        </div>

        {status === "sent" ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <p className="text-white text-[15px] mb-2">Check your email</p>
            <p className="text-slate-light text-sm leading-relaxed">
              We sent a sign-in link to {email}. Click it to open your dashboard.
            </p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-[13px] text-slate-light mb-2">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="you@example.com"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/50 focus:outline-none focus:ring-2 focus:ring-indigo mb-4"
            />

            {status === "error" && (
              <p className="text-rose text-[13px] mb-4">{errorMsg}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={status === "sending"}
              className="w-full bg-grad text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {status === "sending" ? "Sending..." : "Send sign-in link"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}