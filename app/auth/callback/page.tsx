"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

async function findProfile(userId: string) {
  const result = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return result.data;
}

async function findClient(userId: string) {
  const result = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return result.data;
}

async function routeUser(session: any, router: any) {
  let profile = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    profile = await findProfile(session.user.id);
    if (profile) break;
    await new Promise((r) => setTimeout(r, 700));
  }

  if (!profile) {
    router.replace("/setup");
    return;
  }

  const client = await findClient(session.user.id);

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
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;

      if (session) {
        await routeUser(session, router);
        return;
      }

      const authListener = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            authListener.data.subscription.unsubscribe();
            await routeUser(session, router);
          }
        }
      );

      setTimeout(() => {
        authListener.data.subscription.unsubscribe();
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