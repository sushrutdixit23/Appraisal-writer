"use client";

import { useState } from "react";
import SiteNav from "../components/SiteNav";

declare global {
  interface Window { Razorpay: any; }
}

const STEPS = ["Your details", "Your voice", "Payment"];

const TONES = [
  "Warm and friendly",
  "Professional and formal",
  "Direct and concise",
  "Casual and conversational",
];

export default function OnboardPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    linkedin_url: "",
    company_role: "",
    voice_tone: TONES[0],
    voice_signoff: "",
    voice_rules: "",
    daily_cap: "100",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return "Full name is required.";
      if (!form.email.trim() || !form.email.includes("@")) return "Valid email is required.";
      if (!form.linkedin_url.trim() || !form.linkedin_url.includes("linkedin.com")) return "Valid LinkedIn URL is required.";
      if (!form.company_role.trim()) return "Company / Role is required.";
    }
    if (step === 1) {
      if (!form.voice_signoff.trim()) return "Sign-off is required (e.g. — John).";
    }
    return "";
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
  };

  const handlePayment = async () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setLoading(true);

    try {
      // 1. Create Razorpay order
      const orderRes = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 4900000 }), // ₹49,000 in paise
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || "Order creation failed.");

      // 2. Load Razorpay script
      await new Promise<void>((resolve, reject) => {
        if (window.Razorpay) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Razorpay."));
        document.body.appendChild(s);
      });

      // 3. Open Razorpay checkout
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: "Zyntask",
          description: "Engage — Setup Fee",
          order_id: order.id,
          prefill: { name: form.full_name, email: form.email },
          theme: { color: "#5B4BFF" },
          handler: async (response: any) => {
            try {
              // 4. Verify payment + create client
              const res = await fetch("/api/onboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...form,
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
      setLoading(false);
    }
  };

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
            Check your email — we have sent you a sign-in link to access your dashboard. Your LinkedIn connection setup will follow shortly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink overflow-x-hidden">
      <SiteNav />
      <div className="max-w-lg mx-auto px-6 pt-32 pb-20">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={i <= step ? { background: "linear-gradient(115deg,#0A66C2,#5B4BFF)", color: "#fff" } : { background: "rgba(255,255,255,0.1)", color: "#9b95a8" }}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-[12px] font-medium ${i === step ? "text-white" : "text-slate-light"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-white/10 w-8" />}
            </div>
          ))}
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">

          {/* Step 0 — Details */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="font-serif font-semibold text-2xl text-white mb-6">Your details</h2>
              {[
                { label: "Full name", key: "full_name", placeholder: "Sushrut Dixit", type: "text" },
                { label: "Email address", key: "email", placeholder: "you@example.com", type: "email" },
                { label: "LinkedIn profile URL", key: "linkedin_url", placeholder: "https://linkedin.com/in/yourname", type: "url" },
                { label: "Company / Role", key: "company_role", placeholder: "Founder at Zyntask", type: "text" },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-[12.5px] text-slate-light mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 1 — Voice */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-serif font-semibold text-2xl text-white mb-6">Your voice</h2>
              <div>
                <label className="block text-[12.5px] text-slate-light mb-1.5">Tone</label>
                <select
                  value={form.voice_tone}
                  onChange={(e) => set("voice_tone", e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo"
                >
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] text-slate-light mb-1.5">Sign-off</label>
                <input
                  type="text"
                  value={form.voice_signoff}
                  onChange={(e) => set("voice_signoff", e.target.value)}
                  placeholder="— John"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo"
                />
              </div>
              <div>
                <label className="block text-[12.5px] text-slate-light mb-1.5">
                  Voice rules <span className="text-slate-light/50">(optional)</span>
                </label>
                <textarea
                  value={form.voice_rules}
                  onChange={(e) => set("voice_rules", e.target.value)}
                  placeholder="Keep replies under 3 sentences. Never discuss pricing. Always be warm."
                  rows={3}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-light/40 focus:outline-none focus:border-indigo resize-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] text-slate-light mb-1.5">Daily send limit</label>
                <input
                  type="number"
                  value={form.daily_cap}
                  onChange={(e) => set("daily_cap", e.target.value)}
                  min="10"
                  max="200"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo"
                />
              </div>
            </div>
          )}

          {/* Step 2 — Payment */}
          {step === 2 && (
            <div>
              <h2 className="font-serif font-semibold text-2xl text-white mb-2">Payment</h2>
              <p className="text-slate-light text-sm mb-8">One-time setup fee. Monthly retainer billed separately.</p>
              <div className="bg-black/30 border border-white/10 rounded-xl p-6 mb-6">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                  <span className="text-white font-medium">Engage — Setup</span>
                  <span className="font-serif font-semibold text-2xl text-white">₹49,000</span>
                </div>
                <ul className="space-y-2">
                  {[
                    "Full setup and LinkedIn connection",
                    "Voice tuning using your examples",
                    "Approval dashboard access",
                    "Founding client pricing locked in",
                    "Direct access — not a support queue",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-slate-light">
                      <span className="text-indigo mt-0.5">+</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-xl px-5 py-4 mb-6">
                <p className="text-[13px] text-slate-light"><b className="text-white">Reviewing for:</b> {form.full_name} · {form.email}</p>
              </div>
            </div>
          )}

          {error && <p className="text-rose text-[13px] mt-4">{error}</p>}

          <div className="flex justify-between mt-8">
            {step > 0 ? (
              <button onClick={() => { setStep(s => s - 1); setError(""); }} className="text-slate-light text-sm hover:text-white transition-colors">
                ← Back
              </button>
            ) : <div />}

            {step < 2 ? (
              <button
                onClick={next}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handlePayment}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }}
              >
                {loading ? "Processing..." : "Pay ₹49,000 →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
