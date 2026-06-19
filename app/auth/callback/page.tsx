"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [debug, setDebug] = useState("Starting...");

  useEffect(() => {
    const handleAuth = async () => {
      setDebug("Checking hash...");
      const hash = window.location.hash;
      setDebug("Hash: " + hash.slice(0, 50));

      await new Promise(r => setTimeout(r, 1000));

      const { data: { session }, error } = await supabase.auth.getSession();
      setDebug("Session: " + (session ? "FOUND" : "NULL") + " Error: " + (error?.message ?? "none"));

      if (session) {
        router.replace("/dashboard");
        return;
      }

      setDebug("Waiting for auth state change...");
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setDebug("Event: " + event + " Session: " + (session ? "FOUND" : "NULL"));
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();
            router.replace("/dashboard");
          }
        }
      );

      setTimeout(() => {
        subscription.unsubscribe();
        setDebug("Timeout — no session found");
      }, 8000);
    };

    handleAuth();
  }, [router]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center flex-col gap-4">
      <p className="text-slate-light text-sm">Signing you in...</p>
      <p className="text-white text-xs font-mono max-w-lg text-center">{debug}</p>
    </main>
  );
}
