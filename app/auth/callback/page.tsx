"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

async function findClient(userId: string) {
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data;
}

async function routeUser(session: any, router: any) {
  // Retry loop — the JWT can take a moment to attach after a fresh sign-in,
  // so a single immediate query can come back empty due to RLS even when
  // the row genuinely exists. Try a few times before giving up.
  let client = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    client = await findClient(session.user.id);
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

  useEffect(() => {
    const handleAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await routeUser(session, router);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();
            await routeUser(session, router);
          }
        }
      );

      // Generous timeout — covers slow mobile networks and the
      // app-picker redirect delay (Gmail -> browser -> zyntask.in)
      setTimeout(() => {
        subscription.unsubscribe();
        router.replace("/");
      }, 12000);
    };

    handleAuth();
  }, [router]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center">
      <p className="text-slate-light text-sm">Signing you in...</p>
    </main>
  );
}
