"use client";
export const dynamic = "force-dynamic";
import ZyntaskLoader from "../components/ZyntaskLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "../components/SiteNav";
import { supabase } from "../lib/supabase";

declare global {
  interface Window { Razorpay: any; }
}

const TIERS = [
  {
    id: "basic_monthly",
    name: "Starter",
    price: 3999,
    billingLabel: "/ mo",
    period: "monthly",
    cap: 150,
    tagline: "Help me stay consistently visible.",
    features: ["Reply drafting for DMs and comments", "Post drafting, 3 ideas a week", "Scheduling and content calendar", "Approval-first workflow", "Basic analytics", "One LinkedIn profile"],
  },
  {
    id: "basic_annual",
    name: "Starter",
    price: 39990,
    billingLabel: "/ yr",
    period: "annual",
    cap: 150,
    tagline: "Help me stay consistently visible.",
    features: ["Reply drafting for DMs and comments", "Post drafting, 3 ideas a week", "Scheduling and content calendar", "Approval-first workflow", "Basic analytics", "One LinkedIn profile"],
  },
  {
    id: "pro_monthly",
    name: "Professional",
    price: 8999,
    billingLabel: "/ mo",
    period: "monthly",
    cap: 99999,
    tagline: "Help me run my communication workflow.",
    popular: true,
    features: ["Everything in Basic", "Unlimited post ideas", "Comment opportunity detection", "Voice profile, visible and editable", "Repurpose old posts", "Outcome tracking", "Advanced analytics"],
  },
  {
    id: "pro_annual",
    name: "Professional",
    price: 89990,
    billingLabel: "/ yr",
    period: "annual",
    cap: 99999,
    tagline: "Help me run my communication workflow.",
    popular: true,
    features: ["Everything in Basic", "Unlimited post ideas", "Comment opportunity detection", "Voice profile, visible and editable", "Repurpose old posts", "Outcome tracking", "Advanced analytics"],
  },
];

export default function OnboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "pro">("pro");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (typeof window !== "undefined") {
        setTrialExpired(new URLSearchParams(window.location.search).get("expired") === "1");
      }
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

  const selectedTier = TIERS.find(
    (t) => t.period === billingPeriod && t.name.toLowerCase() === selectedPlan.replace("basic", "basic").replace("pro", "professional")
  )!;

  const handlePayment = async () => {
    setError("");
    setPaying(true);
    const tier = selectedTier;
    try {
      const orderRes = await fetch("/api/create-order", {
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
          description: `Engage - ${tier.name} (${tier.period === "annual" ? "Annual" : "Monthly"})`,
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
                  tier: tier.id,
                  daily_cap: tier.cap || 50,
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
        <ZyntaskLoader />
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
            You are all set, {profile.full_name}. Your subscription is active. Head to your dashboard to start using Engage.
          </p>
          <a href="/dashboard" className="inline-flex mt-7 px-7 py-3 rounded-xl text-[14px] font-semibold text-white" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink overflow-x-hidden">
      <SiteNav />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        {trialExpired && (
          <div className="mb-8 rounded-2xl border px-6 py-5 text-center" style={{ background: "rgba(255,68,68,0.06)", borderColor: "rgba(255,68,68,0.2)" }}>
            <p className="text-[13px] font-bold uppercase tracking-wider mb-1" style={{ color: "#FF6B6B" }}>Your free trial has ended</p>
            <p className="text-[14px] text-white/80">Choose a plan below to keep Engage running. Your voice profile and history are saved.</p>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="font-serif font-semibold text-3xl text-white mb-3">
            {trialExpired ? "Upgrade to continue." : `Choose your plan, ${profile.full_name.split(" ")[0]}.`}
          </h1>
          <p className="text-slate-light text-[15px]">
            Your voice profile is already set up. Pick a tier and you are ready to go.
          </p>
        </div>

        {/* Billing period toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-all ${billingPeriod === "monthly" ? "bg-indigo text-white" : "text-slate-light"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-all ${billingPeriod === "annual" ? "bg-indigo text-white" : "text-slate-light"}`}
            >
              Annual <span className="opacity-70">- 2 months free</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {(["basic", "pro"] as const).map((planKey) => {
            const tier = TIERS.find(t => t.period === billingPeriod && t.name.toLowerCase() === (planKey === "basic" ? "basic" : "professional"))!;
            const isSelected = selectedPlan === planKey;
            return (
              <button
                key={planKey}
                onClick={() => setSelectedPlan(planKey)}
                className={`text-left rounded-2xl p-6 border-2 transition-all relative ${
                  isSelected ? "border-indigo bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-6 bg-indigo text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    Most popular
                  </span>
                )}
                <h3 className="font-display font-semibold text-lg text-white mb-1">{tier.name}</h3>
                <p className="text-[11.5px] text-indigo italic mb-3">{tier.tagline}</p>
                <div className="font-serif font-semibold text-2xl text-white mb-4">
                  Rs {tier.price.toLocaleString("en-IN")}<span className="text-sm text-slate-light">{tier.billingLabel}</span>
                </div>
                <ul className="space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="text-[12.5px] text-slate-light flex items-start gap-2">
                      <span className="text-indigo mt-0.5">+</span>{f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {error && <p className="text-rose text-[13px] text-center mb-4">{error}</p>}
        <p className="text-center text-[12px] text-slate-light mt-4 mb-6">
          Running multiple LinkedIn profiles? <a href="mailto:hello@zyntask.in" className="text-indigo hover:underline">Talk to us</a> about agency pricing, or our Founding Access tier.
        </p>

        <div className="text-center">
          <button
            onClick={handlePayment}
            disabled={paying}
            className="px-8 py-3.5 rounded-xl text-base font-medium text-white disabled:opacity-50"
            style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}
          >
            {paying ? "Processing..." : `Pay Rs ${selectedTier.price.toLocaleString("en-IN")}${selectedTier.billingLabel} ->`}
          </button>
        </div>
      </div>
    </main>
  );
}
