"use client";
import { useState, useRef } from "react";

const TONES = ["Conservative", "Confident", "Senior"] as const;
type Tone = typeof TONES[number];

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
        name: "Appraisal Writer",
        description: "Performance Review Generation",
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
        theme: { color: "#1a1a1a" },
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

  return (
    <main className="min-h-screen bg-white max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Appraisal Writer
      </h1>
      <p className="text-gray-500 mb-10">
        You did the work. The hard part is saying so without sounding arrogant
        or making excuses. We handle that.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Job Title
          </label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What did you do this year? (plain language, no polish needed)
          </label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={6}
            placeholder="Tell us like you'd tell a friend. What did you work on? What was hard? What did you figure out on your own?"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tone
          </label>
          <div className="flex gap-3">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  tone === t
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                }`}
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

        <button
          onClick={handlePayAndGenerate}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Generating your appraisal..." : "Generate for ₹149"}
        </button>

        <div className="border-t pt-6">
          <p className="text-xs text-gray-400 mb-2">
            Had a failed generation? Recover your result using your payment ID.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={recoveryId}
              onChange={(e) => setRecoveryId(e.target.value)}
              placeholder="pay_xxxxxxxxxxxxxxx"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
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
      </div>
      <p className="text-xs text-gray-400 text-center mt-8">
         Problems? Email <a href="mailto:support@zyntask.in" className="underline">support@zyntask.in</a> with your payment ID.
      </p>

      {output && (
        <div className="mt-12" ref={outputRef}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Your Appraisal
            </h2>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              className="text-sm text-gray-500 hover:text-gray-900 underline"
            >
              Copy to clipboard
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded-lg p-6 leading-relaxed">
            {output}
          </pre>
          {paymentId && (
            <p className="text-xs text-gray-400 mt-3">
              Payment ID: <span className="font-mono">{paymentId}</span> — save this to recover your result anytime.
            </p>
          )}
        </div>
      )}
    </main>
  );
}