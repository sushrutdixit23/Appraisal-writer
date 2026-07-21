"use client";

import { useState } from "react";
import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

export default function RetrievePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  const retrieve = async () => {
    if (!code.trim()) {
      setError("Enter your retrieval code first.");
      return;
    }
    setError("");
    setDone(false);
    setWorking(true);
    try {
      const res = await fetch("/api/pdf-retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Retrieval failed.");
        return;
      }
      const pdfRes = await fetch("/api/resume-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: data.resume, token: data.token }),
      });
      if (!pdfRes.ok) {
        const pdfErr = await pdfRes.json().catch(() => ({}));
        setError(pdfErr.error || "Could not regenerate the PDF.");
        return;
      }
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(data.resume?.name || "resume").replace(/[^a-zA-Z0-9]+/g, "_")}_resume.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-screen bg-mist relative overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-md mx-auto px-6 pt-28 pb-20">

          <div className="mb-8 text-center">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-2">Download recovery</p>
            <h1 className="font-display font-bold text-[28px] tracking-tight text-ink mb-2">Retrieve your paid PDF</h1>
            <p className="text-slate text-[14.5px] leading-relaxed">Lost your download after paying? Enter the retrieval code you were shown - it works for 48 hours after payment, on any device.</p>
          </div>

          <div className="bg-cloud border border-line rounded-[24px] p-8 shadow-zy-sm mb-6">
            <label className="block mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-slate">Retrieval code</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              maxLength={9}
              className="w-full bg-mist border border-line rounded-[14px] px-4 py-3.5 text-[18px] font-mono tracking-[0.15em] text-center text-ink placeholder-slate-light focus:outline-none focus:border-indigo/40 transition-colors mb-4"
            />
            {error && <p className="text-rose text-[13px] mb-4">{error}</p>}
            {done && <p className="text-[13px] mb-4" style={{ color: "#1a9c6b" }}>Downloaded. Your code remains valid until it expires.</p>}
            <button
              onClick={retrieve}
              disabled={working}
              className="w-full py-3.5 rounded-[13px] text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(91,75,255,0.3)] hover:opacity-90 transition-all disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {working ? "Retrieving..." : "Download my PDF"}
            </button>
          </div>

          <p className="text-[12.5px] text-slate-light text-center leading-relaxed">
            Code expired or never received one? Email <a href="mailto:support@zyntask.in" className="text-indigo hover:underline">support@zyntask.in</a> with your payment reference and we&apos;ll sort it out.
          </p>

        </div>
      </div>
    </main>
  );
}
