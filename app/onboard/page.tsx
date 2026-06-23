"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "../components/SiteNav";
import { supabase } from "../lib/supabase";

declare global {
  interface Window { Razorpay: any; }
}

const TIERS = [
  {
    id: "tier3",
    name: "Tier 3",
    price: 6999,
    cap: 60,
    features: ["Up to 60 replies/day", "DMs + Comments monitored", "Basic voice setup", "Email support"],
  },
  {
    id: "tier2",
    name: "Tier 2",
    price: 9999,
    cap: 120,
    features: ["Up to 120 replies/day", "DMs + Comments monitored", "Standard voice setup", "Email support"],
    popular: true,
  },
  {
    id: "tier1",
    name: "Tier 1",
    price: 13999,
    cap: null,
    features: ["Custom daily limit", "DMs + Comments monitored", "Deep voice tuning", "Direct support"],
  },
];

export default function OnboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [selectedTier, setSelectedTier] = useState("tier2");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!profileData) {
        router.replace("/setup");
        return;
      }

      setProfile(profileData);
      setLoading(false);
    };
    init();
  }, [router]);

  const handlePayment = async () => {
    setError("");
    setPaying(true);

    const tier = TIERS.find((t) => t.id === selectedTier)!;

    try {
      const orderRes = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tier.price * 100 }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || "Order creation failed.");

      await new Promise<void>((resolve, reject) => {
        if (window.Razorpay) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Razorpay."));
        document.body.appendChild(s);
      });

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: "Zyntask",
          description: `Engage â€” ${tier.name}`,
          order_id: order.id,
          prefill: { name: profile.full_name },
          theme: { color: "#5B4BFF" },
          handler: async (response: any) => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const res = await fetch("/api/onboard", {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                  tier: selectedTier,
                  daily_cap: tier.cap || 100,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.error || "Onboarding failed.");
              setDone(true);
              resolve();
            } catch (e: any) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
        });
        rzp.open();
      });
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <p className="text-slate-light text-sm">Loading...</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-grad flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 20 20" className="w-8 h-8 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5 8.5 15 16 5.5" />
            </svg>
          </div>
          <h1 className="font-serif font-semibold text-3xl text-white mb-3">You are in.</h1>
          <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto">
            Thanks, {profile.full_name}. We will reach out shortly to connect your LinkedIn account and get Engage live for you.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink overflow-x-hidden">
      <SiteNav />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        <div className="text-center mb-12">
          <h1 className="font-serif font-semibold text-3xl text-white mb-3">
            Choose your plan, {profile.full_name.split(" ")[0]}.
          </h1>
          <p className="text-slate-light text-[15px]">
            Your voice profile is already set up. Pick a tier and you are ready to go.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {TIERS.map((tier) => (
            <button
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`text-left rounded-2xl p-6 border-2 transition-all relative ${
                selectedTier === tier.id
                  ? "border-indigo bg-white/[0.06]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-6 bg-indigo text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  Most popular
                </span>
              )}
              <h3 className="font-display font-semibold text-lg text-white mb-1">{tier.name}</h3>
              <div className="font-serif font-semibold text-2xl text-white mb-4">
                Rs {tier.price.toLocaleString("en-IN")}<span className="text-sm text-slate-light">/mo</span>
              </div>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="text-[12.5px] text-slate-light flex items-start gap-2">
                    <span className="text-indigo mt-0.5">+</span>{f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {error && <p className="text-rose text-[13px] text-center mb-4">{error}</p>}

        <div className="text-center">
          <button
            onClick={handlePayment}
            disabled={paying}
            className="px-8 py-3.5 rounded-xl text-base font-medium text-white disabled:opacity-50"
            style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}
          >
            {paying ? "Processing..." : `Pay Rs ${TIERS.find((t) => t.id === selectedTier)!.price.toLocaleString("en-IN")} â†’`}
          </button>
        </div>
      </div>
    </main>
  );
}
