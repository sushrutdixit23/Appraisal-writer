"use client";
export const dynamic = "force-dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import ZyntaskLoader from "../../components/ZyntaskLoader";

async function findProfile(userId: string) {
  const result = await supabase.from("profiles").select("id").eq("auth_user_id", userId).maybeSingle();
  return result.data;
}

async function findClient(userId: string) {
  const result = await supabase.from("clients").select("id").eq("auth_user_id", userId).maybeSingle();
  return result.data;
}

async function routeUser(session: any, router: any) {
  let profile = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    profile = await findProfile(session.user.id);
    if (profile) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!profile) { router.replace("/setup"); return; }
  const client = await findClient(session.user.id);
  router.replace("/welcome");
}

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) { await routeUser(data.session, router); return; }
      }
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const hashParams = new URLSearchParams(hash.replace("#", ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!error && data.session) { await routeUser(data.session, router); return; }
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await routeUser(session, router); return; }
      const authListener = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          authListener.data.subscription.unsubscribe();
          await routeUser(session, router);
        }
      });
      setTimeout(() => { authListener.data.subscription.unsubscribe(); router.replace("/"); }, 12000);
    };
    handleAuth();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "#16181F" }}>
      <div className="text-center px-6">
        <div className="flex justify-center mb-6">
          <ZyntaskLoader size={72} />
        </div>
        <p className="font-display font-semibold text-white text-[18px] mb-2">Zyntask</p>
        <p className="text-[14px]" style={{ color: "#6b6880" }}>Signing you in</p>
      </div>
    </main>
  );
}
