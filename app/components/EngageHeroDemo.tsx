"use client";
import { useEffect, useState } from "react";

const REPLY_TEXT = "Thanks so much, Rohan - really appreciate that. Yes, taking on a few new clients this quarter. Happy to set up a quick call to see if it is a fit.";

export default function EngageHeroDemo() {
  const [typed, setTyped] = useState("");
  const [pressed, setPressed] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let charIndex = 0;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const run = () => {
      setTyped("");
      setPressed(false);
      setSent(false);
      charIndex = 0;

      const typeNext = () => {
        if (cancelled) return;
        if (charIndex < REPLY_TEXT.length) {
          charIndex++;
          setTyped(REPLY_TEXT.slice(0, charIndex));
          timers.push(setTimeout(typeNext, 16));
        } else {
          timers.push(setTimeout(() => {
            if (cancelled) return;
            setPressed(true);
            timers.push(setTimeout(() => {
              if (cancelled) return;
              setSent(true);
              timers.push(setTimeout(() => { if (!cancelled) run(); }, 3200));
            }, 260));
          }, 900));
        }
      };
      timers.push(setTimeout(typeNext, 700));
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="relative z-10 max-w-md mx-auto md:mx-0 text-left">
      <div className="bg-white/[0.06] border border-white/10 rounded-[20px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-[13px] text-white flex-shrink-0" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }}>R</div>
          <div>
            <p className="text-[13px] font-semibold text-white">Rohan Desai</p>
            <p className="text-[11px] text-slate-light">Founder, Stacked Labs</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgba(255,68,68,0.12)", color: "#FF6B6B", border: "1px solid rgba(255,68,68,0.25)" }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#FF4444" }} />
            Hot lead
          </span>
        </div>
        <p className="text-[13px] text-white/75 bg-black/25 rounded-xl px-3.5 py-2.5 mb-3.5 leading-relaxed">
          Would love to explore working together - are you taking on clients this quarter?
        </p>

        {!sent ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-light mb-1.5">Drafted reply</div>
            <p className="text-[13px] text-white/90 leading-relaxed mb-4 min-h-[64px]">
              {typed}
              <span className="inline-block w-[2px] h-[13px] bg-sky align-middle ml-0.5" style={{ animation: "engageCursorBlink 1s step-end infinite" }} />
            </p>
            <div className="flex gap-2 justify-end">
              <span className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/15 text-white/70">Skip</span>
              <div className="relative">
                <div className="absolute inset-0 rounded-lg blur-md opacity-60 animate-pulse" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }} />
                <span
                  className="relative inline-block px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-transform duration-150"
                  style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)", transform: pressed ? "scale(0.94)" : "scale(1)" }}
                >
                  Approve and send
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3 py-6" style={{ animation: "engagePopIn 0.5s cubic-bezier(0.2,0.8,0.3,1.3) forwards" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
              <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 stroke-white stroke-[2.6] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
            </div>
            <span className="text-[13px] font-semibold text-white">Sent - in your voice, on your word.</span>
          </div>
        )}
      </div>
      <p className="text-center text-[11.5px] text-slate-light mt-3">This is what waits for you. One glance, one yes.</p>

      <style>{`
        @keyframes engageCursorBlink { 50% { opacity: 0; } }
        @keyframes engagePopIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
