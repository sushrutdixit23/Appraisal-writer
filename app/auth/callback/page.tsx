"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

async function findClient(userId: string) {
  const result = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return result.data;
}

async function routeUser(session: any, router: any, setDebug: any) {
  let client = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    client = await findClient(session.user.id);
    setDebug(`Client check attempt ${attempt + 1}: ${client ? "FOUND" : "not found"}`);
    if (client) break;
    await new Promise((r) => setTimeout(r, 700));
  }

  if (client) {
    router.replace("/dashboard");
  } else {
    router.replace("/welcome");
  }
}

export default function AuthCallback() {
  const router = useRouter();
  const [debug, setDebug] = useState("Starting...");

  useEffect(() => {
    const handleAuth = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      setDebug(`URL: ${window.location.href.slice(0, 80)}`);

      if (code) {
        setDebug("Code found, exchanging...");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setDebug("Exchange error: " + error.message);
        }
        if (data?.session) {
          setDebug("Session from code exchange: FOUND");
          await routeUser(data.session, router, setDebug);
          return;
        }
      }

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;
      setDebug((prev) => prev + " | getSession: " + (session ? "FOUND" : "NULL"));

      if (session) {
        await routeUser(session, router, setDebug);
        return;
      }

      const authListener = supabase.auth.onAuthStateChange(
        async (event, session) => {
          setDebug((prev) => prev + ` | event: ${event}`);
          if (event === "SIGNED_IN" && session) {
            authListener.data.subscription.unsubscribe();
            await routeUser(session, router, setDebug);
          }
        }
      );

      setTimeout(() => {
        authListener.data.subscription.unsubscribe();
        setDebug((prev) => prev + " | TIMEOUT");
      }, 12000);
    };

    handleAuth();
  }, [router]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center flex-col gap-4 px-6">
      <p className="text-slate-light text-sm">Signing you in...</p>
      <p className="text-white text-xs font-mono break-all text-center">{debug}</p>
    </main>
  );
}