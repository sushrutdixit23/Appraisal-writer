"use client";
import { useState, useRef } from "react";
import SiteNav from "../components/SiteNav";

const TONES = ["Conservative", "Confident", "Senior"] as const;
type Tone = typeof TONES[number];

function parseOutput(raw: string): { bullets: string[]; summary: string } {
  const bulletsMatch = raw.match(/BULLETS\s*([\s\S]*?)\s*SUMMARY/i);
  const summaryMatch = raw.match(/SUMMARY\s*([\s\S]*)/i);

  const bullets = bulletsMatch
    ? bulletsMatch[1]
        .split("\n")
        .map((l) => l.replace(/^[•\-]\s*/, "").trim())
        .filter(Boolean)
    : [];

  const summary = summaryMatch ? summaryMatch[1].trim() : raw;

  return { bullets, summary };
}

export default function Home() {
  const [jobTitle, setJobTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [tone, setTone] = useState<Tone>("Confident");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recoveryId, setRecoveryId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  const handlePayAndGenerate = async () => {
    if (!jobTitle.trim() || !rawInput.trim()) {
      setError("Please fill in both fields.");
      return;
    }
    if (rawInput.trim().split(/\s+/).length < 20) {
      setError("Give us a bit more to work with — at least 20 words.");
      return;
    }
    if (rawInput.length > 3000) {
      setError("Please keep your input under 3000 characters.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 14900 }),
      });
      const order = await orderRes.json();
      if (!order.id) throw new Error("Order creation failed");

      if (!(window as any).Razorpay) {
        setError("Payment system failed to load. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "Zyntask",
        description: "Appraisal Writer — one generation",
        order_id: order.id,
        handler: async (response: any) => {
          try {
            setPaymentId(response.razorpay_payment_id);
            const genRes = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                jobTitle,
                tone,
                rawInput,
              }),
            });
            const result = await genRes.json();
            if (result.error) {
              setError(result.error);
              if (result.payment_id) {
                setPaymentId(result.payment_id);
              }
              return;
            }
            setOutput(result.output);
            setTimeout(() => {
              outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
          } catch (err: any) {
            setError(err.message || "Generation failed. Use your payment ID below to recover.");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        prefill: {},
        theme: { color: "#5B4BFF" },
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  const handleRecover = async () => {
    if (!recoveryId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: recoveryId.trim() }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setOutput(result.output);
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "Recovery failed. Contact support.");
    } finally {
      setLoading(false);
    }
  };

  const parsed = output ? parseOutput(output) : null;

  return (
    <main className="min-h-screen bg-mist overflow-x-hidden">
      <SiteNav />

      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 bg-cloud border border-line px-4 py-1.5 rounded-full shadow-zy-sm text-ink-soft font-mono text-[11px] tracking-wide uppercase mb-6">
            By Zyntask
          </span>
          <h1 className="font-display font-bold tracking-tight text-[clamp(30px,4vw,40px)] text-ink mb-3">
            Appraisal Writer
          </h1>
          <p className="text-slate text-[17px] leading-relaxed max-w-[40ch] mx-auto">
            You did the work. The hard part is saying so without sounding arrogant or making excuses. We handle that.
          </p>
        </div>

        <div className="bg-cloud border border-line rounded-[20px] p-7 shadow-zy-sm">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                Your Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full border border-line rounded-[11px] px-4 py-2.5 text-sm bg-mist focus:outline-none focus:ring-2 focus:ring-indigo focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                What did you do this year?
              </label>
              <p className="text-xs text-slate-light mb-2">
                Mention what you improved, any time saved, who you helped, and anything you owned end-to-end — even rough notes work.
              </p>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                rows={5}
                placeholder="Tell us like you'd tell a friend. What did you work on? What was hard? What did you figure out on your own?"
                className="w-full border border-line rounded-[11px] px-4 py-2.5 text-sm bg-mist focus:outline-none focus:ring-2 focus:ring-indigo focus:border-transparent resize-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-2.5">
                Tone
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`px-3 py-2.5 rounded-[10px] text-sm font-medium border transition-colors ${
                      tone === t
                        ? "bg-indigo/10 border-indigo text-indigo-deep"
                        : "bg-cloud border-line text-slate hover:border-slate-light"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-rose/10 border border-rose/30 rounded-[11px] px-4 py-3">
                <p className="text-rose text-sm">{error}</p>
                {paymentId && (
                  <p className="text-rose/70 text-xs mt-1">
                    Your payment ID: <span className="font-mono font-medium">{paymentId}</span> — use the recovery tool below.
                  </p>
                )}
              </div>
            )}

            <div>
              <button
                onClick={handlePayAndGenerate}
                disabled={loading}
                className="w-full text-white py-3.5 rounded-[12px] text-sm font-medium bg-grad shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(91,75,255,0.45)] transition-all disabled:opacity-50 disabled:translate-y-0"
              >
                {loading ? "Generating your appraisal..." : "Generate for ₹149"}
              </button>
              <p className="text-xs text-slate-light text-center mt-3 flex items-center justify-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Secured by Razorpay · one-time payment, no subscription
              </p>
            </div>
          </div>
        </div>

        {parsed && (
          <div className="bg-cloud border border-line rounded-[20px] p-7 shadow-zy-sm mt-6" ref={outputRef}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-display font-semibold text-lg text-ink">
                Your Appraisal
              </h2>
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="text-sm font-medium text-indigo hover:text-indigo-deep transition-colors"
              >
                Copy to clipboard
              </button>
            </div>

            {parsed.bullets.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-light uppercase tracking-wide mb-2.5">
                  Bullets
                </p>
                <ul className="space-y-2 text-sm text-ink-soft leading-relaxed list-disc pl-5">
                  {parsed.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.summary && (
              <div>
                <p className="text-xs font-medium text-slate-light uppercase tracking-wide mb-2.5">
                  Summary
                </p>
                <p className="text-sm text-ink-soft leading-relaxed">
                  {parsed.summary}
                </p>
              </div>
            )}

            {paymentId && (
              <p className="text-xs text-slate-light mt-5 pt-5 border-t border-line">
                Payment ID: <span className="font-mono">{paymentId}</span> — save this to recover your result anytime.
              </p>
            )}
          </div>
        )}

        <div className="mt-7 pt-6 border-t border-line">
          <p className="text-xs text-slate-light mb-2.5">
            Had a failed generation? Recover your result using your payment ID.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={recoveryId}
              onChange={(e) => setRecoveryId(e.target.value)}
              placeholder="pay_xxxxxxxxxxxxxxx"
              className="flex-1 border border-line rounded-[11px] px-4 py-2.5 text-sm bg-cloud focus:outline-none focus:ring-2 focus:ring-indigo"
            />
            <button
              onClick={handleRecover}
              disabled={loading || !recoveryId.trim()}
              className="px-5 py-2.5 bg-cloud text-ink-soft rounded-[11px] text-sm border border-line hover:border-slate-light disabled:opacity-50 transition-colors"
            >
              Recover
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-light text-center mt-9">
          Problems? Email{" "}
          <a href="mailto:support@zyntask.in" className="underline text-indigo hover:text-indigo-deep">
            support@zyntask.in
          </a>{" "}
          with your payment ID.
        </p>
      </div>
    </main>
  );
}