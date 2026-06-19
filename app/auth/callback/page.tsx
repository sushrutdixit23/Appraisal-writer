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
        // Link auth_user_id to client row if not already linked
        const { data: client } = await supabase
          .from("clients")
          .select("id, auth_user_id")
          .is("auth_user_id", null)
          .eq("voice_name", session.user.user_metadata?.full_name ?? "")
          .single();

        if (client) {
          await supabase
            .from("clients")
            .update({ auth_user_id: session.user.id })
            .eq("id", client.id);
        }

        await new Promise(r => setTimeout(r, 500));
        router.replace("/dashboard");
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            subscription.unsubscribe();

            const { data: client } = await supabase
              .from("clients")
              .select("id, auth_user_id")
              .is("auth_user_id", null)
              .eq("voice_name", session.user.user_metadata?.full_name ?? "")
              .single();

            if (client) {
              await supabase
                .from("clients")
                .update({ auth_user_id: session.user.id })
                .eq("id", client.id);
            }

            await new Promise(r => setTimeout(r, 500));
            router.replace("/dashboard");
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
