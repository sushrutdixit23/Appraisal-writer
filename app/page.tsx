"use client";
import { useState, useRef } from "react";

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
        theme: { color: "#1D4DFF" },
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo.png" alt="Zyntask" className="w-7 h-7 rounded-md" />
          <span className="text-sm font-medium text-gray-500">Zyntask</span>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Appraisal Writer
        </h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          You did the work. The hard part is saying so without sounding arrogant
          or making excuses. We handle that.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Your Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                What did you do this year?
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Mention what you improved, any time saved, who you helped, and anything you owned end-to-end — even rough notes work.
              </p>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                rows={5}
                placeholder="Tell us like you'd tell a friend. What did you work on? What was hard? What did you figure out on your own?"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
                    style={
                      tone === t
                        ? { backgroundColor: "#E6F1FB", borderColor: "#1D4DFF", color: "#1D4DFF" }
                        : { backgroundColor: "white", borderColor: "#D1D5DB", color: "#6B7280" }
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
                {paymentId && (
                  <p className="text-red-400 text-xs mt-1">
                    Your payment ID: <span className="font-mono font-medium">{paymentId}</span> — use the recovery tool below.
                  </p>
                )}
              </div>
            )}

            <div>
              <button
                onClick={handlePayAndGenerate}
                disabled={loading}
                className="w-full text-white py-3 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "#1D4DFF" }}
              >
                {loading ? "Generating your appraisal..." : "Generate for ₹149"}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2.5 flex items-center justify-center gap-1">
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
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mt-6" ref={outputRef}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                Your Appraisal
              </h2>
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="text-sm font-medium hover:underline"
                style={{ color: "#1D4DFF" }}
              >
                Copy to clipboard
              </button>
            </div>

            {parsed.bullets.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Bullets
                </p>
                <ul className="space-y-2 text-sm text-gray-800 leading-relaxed list-disc pl-5">
                  {parsed.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.summary && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Summary
                </p>
                <p className="text-sm text-gray-800 leading-relaxed">
                  {parsed.summary}
                </p>
              </div>
            )}

            {paymentId && (
              <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
                Payment ID: <span className="font-mono">{paymentId}</span> — save this to recover your result anytime.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-2">
            Had a failed generation? Recover your result using your payment ID.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={recoveryId}
              onChange={(e) => setRecoveryId(e.target.value)}
              placeholder="pay_xxxxxxxxxxxxxxx"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
            />
            <button
              onClick={handleRecover}
              disabled={loading || !recoveryId.trim()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
            >
              Recover
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          Problems? Email{" "}
          <a href="mailto:support@zyntask.in" className="underline" style={{ color: "#1D4DFF" }}>
            support@zyntask.in
          </a>{" "}
          with your payment ID.
        </p>
      </div>
    </main>
  );
}