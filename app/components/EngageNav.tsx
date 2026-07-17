"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EngageNav() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: "linear-gradient(180deg, rgba(20,23,42,0.75) 0%, rgba(15,17,30,0.4) 70%, rgba(15,17,30,0) 100%)" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 h-[62px] md:h-[72px] flex items-center justify-between gap-6">
        <a href="/" className="font-serif font-semibold text-xl md:text-2xl text-white tracking-tight">Zyntask</a>
        <div className="hidden md:flex items-center gap-8">
          <a href="/engage#features" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Features</a>
          <a href="/engage#pricing" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Pricing</a>
          <a href="/#agents" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Agents</a>
          <a href="/appraisal-writer" className="text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap tracking-wide">Appraisal Writer</a>
        </div>
        <div className="flex items-center gap-3">
          {authed === false && (
            <a href="/?signin=true" className="hidden sm:inline text-[13.5px] font-medium text-white/65 hover:text-white transition-colors whitespace-nowrap">Sign in</a>
          )}
          <a href="/dashboard" className="px-4 py-2 rounded-xl text-[13.5px] font-semibold text-white whitespace-nowrap transition-all hover:opacity-90" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)" }}>Dashboard</a>
        </div>
      </div>
    </div>
  );
}
