"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

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

      setTimeout(() => {
        subscription.unsubscribe();
        router.replace("/login");
      }, 8000);
    };

    handleAuth();
  }, [router]);

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center">
      <p className="text-slate-light text-sm">Signing you in...</p>
    </main>
  );
}

async function routeUser(session: any, router: any) {
  await new Promise(r => setTimeout(r, 500));

  // Check if they have a client row (Engage client)
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .single();

  if (client) {
    router.replace("/welcome");
  } else {
    router.replace("/welcome");
  }
}

