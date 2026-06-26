import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engage by Zyntask - Your LinkedIn voice, on time",
  description: "Engage watches your LinkedIn comments and messages, drafts replies in your voice, scores your leads, and waits for your approval before anything is sent. Start with a free trial.",
};

import SiteNav from "../components/SiteNav";
import Reveal from "../components/Reveal";

const btn = "font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]";

export default function EngagePage() {
  return (
    <main className="relative min-h-screen bg-ink overflow-x-hidden">
      <div className="aurora-page-dark" />

      <div className="relative z-10">
        <SiteNav />

        <header className="relative pt-[70px] pb-24 text-white">
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-16">
            <div className="font-serif italic text-[15px] tracking-wide text-slate-light mb-8">by <span className="text-white not-italic font-semibold">Zyntask</span></div>
            <h1 className="font-serif font-semibold tracking-tight leading-[1.0] text-[clamp(52px,9vw,108px)] mb-3 text-white">Engage<span style={{ color: "#8a6ff0" }}>.</span></h1>
            <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-slate-light mb-10">Your LinkedIn voice, on time, every time</p>
            <h2 className="font-display font-semibold tracking-tight leading-[1.1] text-[clamp(26px,3.6vw,38px)] mb-7 text-white/95 max-w-[20ch] mx-auto">You never miss a meaningful LinkedIn conversation.</h2>
            <p className="text-[18px] text-slate-light max-w-[50ch] mx-auto mb-10 leading-relaxed">Engage watches your comments and messages, writes thoughtful replies that sound like you, scores which leads are hot, and lines them up for a quick yes before anything is sent.</p>
            <div className="flex gap-3.5 flex-wrap items-center justify-center">
              <a href="/setup" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg ${btn}`}>Start free trial</a>
              <a href="#how" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base text-white border border-white/20 hover:border-white/40 ${btn}`}>See how it works</a>
            </div>

            <div className="relative z-10 max-w-md mx-auto mt-16 text-left">
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
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-light mb-1.5">Drafted reply</div>
                <p className="text-[13px] text-white/90 leading-relaxed mb-4">
                  Thanks so much, Rohan - really appreciate that. Yes, taking on a few new clients this quarter. Happy to set up a quick call to see if it is a fit.
                </p>
                <div className="flex gap-2 justify-end">
                  <span className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/15 text-white/70">Skip</span>
                  <div className="relative">
                    <div className="absolute inset-0 rounded-lg blur-md opacity-60 animate-pulse" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }} />
                    <span className="relative inline-block px-4 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
                      Approve and send
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-center text-[11.5px] text-slate-light mt-3">This is what waits for you. One glance, one yes.</p>
            </div>
          </div>
        </header>

        <Reveal>
          <section className="py-24">
            <div className="max-w-3xl mx-auto px-6 text-center">
              <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] mb-5 text-white">Stay present without living in your inbox.</h2>
              <p className="text-lg text-slate-light leading-relaxed mb-4">A strong presence on LinkedIn runs on replies - to the comments on your posts and the messages in your inbox. Keeping up is a job in itself.</p>
              <p className="text-lg text-slate-light leading-relaxed">Engage takes that weight off your day. It keeps an eye on your conversations, drafts a thoughtful reply to each one in your voice, and hands you a queue you can clear in minutes.</p>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="how" className="py-24">
            <div className="max-w-6xl mx-auto px-6">
              <div className="max-w-[660px] mx-auto mb-14 text-center">
                <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">How it works</span>
                <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] text-white">Three simple steps.</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { n: "i", title: "It watches", body: "Engage quietly checks your direct messages and the comments on your recent posts, so nothing meaningful slips by." },
                  { n: "ii", title: "It drafts", body: "For each new message, it works out what the person needs and writes a reply in your voice - ready to send, never sent on its own." },
                  { n: "iii", title: "You approve", body: "Every draft waits for you in one simple screen. Read it, send it as-is, adjust it, or skip it. Nothing leaves without your yes." },
                ].map((step) => (
                  <div key={step.n} className="bg-white/[0.05] border border-white/10 rounded-[20px] p-7 transition-all duration-300 hover:-translate-y-1">
                    <div className="font-serif italic text-[#8a6ff0] text-4xl mb-3">{step.n}</div>
                    <h3 className="font-semibold text-xl mb-2 text-white">{step.title}</h3>
                    <p className="text-[15px] text-slate-light leading-relaxed">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-6xl mx-auto px-6">
              <div className="max-w-[660px] mx-auto mb-14 text-center">
                <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">New</span>
                <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] text-white">Know which leads to chase first.</h2>
                <p className="text-slate-light text-[16px] mt-4 leading-relaxed max-w-[52ch] mx-auto">Not every message is equal. Engage now reads intent and tells you where the real opportunities are - so your time goes to the conversations that matter.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white/[0.05] border rounded-[20px] p-7" style={{ borderColor: "rgba(255,68,68,0.25)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#FF4444" }} />
                    <span className="font-bold text-[13px] uppercase tracking-wide" style={{ color: "#FF6B6B" }}>Hot</span>
                  </div>
                  <p className="text-[14px] text-slate-light leading-relaxed">A clear buying signal or a direct request to work together. These rise to the top of your queue.</p>
                </div>
                <div className="bg-white/[0.05] border rounded-[20px] p-7" style={{ borderColor: "rgba(245,166,35,0.25)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#F5A623" }} />
                    <span className="font-bold text-[13px] uppercase tracking-wide" style={{ color: "#F5A623" }}>Warm</span>
                  </div>
                  <p className="text-[14px] text-slate-light leading-relaxed">Genuine interest or a real question with potential. Worth a thoughtful, timely reply.</p>
                </div>
                <div className="bg-white/[0.05] border rounded-[20px] p-7" style={{ borderColor: "rgba(74,158,255,0.25)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#4A9EFF" }} />
                    <span className="font-bold text-[13px] uppercase tracking-wide" style={{ color: "#4A9EFF" }}>Cold</span>
                  </div>
                  <p className="text-[14px] text-slate-light leading-relaxed">Praise, a quick hello, or no clear intent. Still answered in your voice, just lower priority.</p>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-6xl mx-auto px-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white/[0.05] border border-white/10 rounded-[24px] p-9">
                  <span className="block font-mono text-sky text-[11px] tracking-[0.12em] uppercase mb-3.5">Response time</span>
                  <h3 className="font-display font-semibold text-[24px] tracking-tight mb-3 text-white">See how fast you really reply.</h3>
                  <p className="text-[15px] text-slate-light leading-relaxed">Every approval is timed, so you can see how quickly conversations get answered and watch that number improve. Speed is what turns a warm lead into a real one.</p>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-[24px] p-9">
                  <span className="block font-mono text-sky text-[11px] tracking-[0.12em] uppercase mb-3.5">Set up in minutes</span>
                  <h3 className="font-display font-semibold text-[24px] tracking-tight mb-3 text-white">Connect yourself, start today.</h3>
                  <p className="text-[15px] text-slate-light leading-relaxed">No onboarding calls to wait for. Connect your LinkedIn securely, capture your voice from a few real examples, and your free trial begins the moment you are set up - all from your own dashboard.</p>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-6xl mx-auto px-6">
              <div className="max-w-[660px] mx-auto mb-14 text-center">
                <span className="block text-sky font-mono text-xs tracking-[0.12em] uppercase mb-3.5">Built to be safe</span>
                <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] text-white">The promise that protects your account.</h2>
              </div>

              <div className="relative overflow-hidden rounded-[24px] p-8 md:p-9 mb-5 border border-white/10" style={{ background: "rgba(91,75,255,0.06)" }}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(91,75,255,0.30),transparent_55%)] pointer-events-none" />
                <div className="relative z-10 flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
                    <svg viewBox="0 0 20 20" className="w-5 h-5 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 10.5 8.5 15 16 5.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[19px] mb-1.5 text-white">Nothing sends without you</h3>
                    <p className="text-[14.5px] text-white/80 leading-relaxed max-w-[60ch]">Every single reply is read and approved by you before it reaches anyone. There is no setting that changes that - it is the core of how Engage works.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { title: "A daily limit, always on", body: "Engage will never send more than a set number of messages a day, keeping your activity well inside what LinkedIn treats as normal." },
                  { title: "Spam stays out", body: "Promotional blasts, cold sales pitches, and messages from company pages are filtered out before they ever reach your queue." },
                  { title: "Big moments come to you", body: "Any message about a call, a meeting, or working together is always set aside for your personal attention." },
                ].map((g) => (
                  <div key={g.title} className="bg-white/[0.05] border border-white/10 rounded-[20px] p-7 transition-all duration-300 hover:-translate-y-1">
                    <h3 className="font-semibold text-[16px] mb-2 text-white">{g.title}</h3>
                    <p className="text-[14px] text-slate-light leading-relaxed">{g.body}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white/[0.05] border border-white/10 rounded-[20px] p-7 mt-5">
                <h3 className="font-semibold text-[17px] mb-2 text-white">It sounds like you - because it learns from you</h3>
                <p className="text-[14.5px] text-slate-light leading-relaxed">Before it writes a word, Engage is tuned using real examples of how you actually reply - your phrasing, your warmth, your rhythm. The drafts read like you on a focused day, and they get sharper every time you edit one.</p>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="pricing" className="py-24">
            <div className="max-w-6xl mx-auto px-6">
              <div className="max-w-[640px] mx-auto mb-14 text-center">
                <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">Pricing</span>
                <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] mb-5 text-white">Start free. Decide later.</h2>
                <p className="text-slate-light text-[16px] leading-relaxed max-w-[50ch] mx-auto">Try Engage free for a week, no payment needed. Keep going only if it earns its place in your day.</p>
              </div>

              <div className="relative overflow-hidden rounded-[28px] p-9 md:p-10 mb-6 text-center" style={{ background: "linear-gradient(125deg,#5B4BFF,#8a6ff0)" }}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_45%)] pointer-events-none" />
                <div className="relative z-10">
                  <span className="inline-block font-mono text-[11px] tracking-[0.12em] uppercase bg-white/20 px-3 py-1 rounded-full mb-4 text-white">Most popular</span>
                  <h3 className="font-serif font-semibold text-[34px] mb-2 text-white">Free trial</h3>
                  <p className="text-white/85 text-[15px] mb-7">A week, free, up to 50 replies a day, full access, no payment.</p>
                  <a href="/setup" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg ${btn}`}>
                    Start free trial
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white/[0.05] border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">Monthly</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 8,999<span className="text-[15px] text-slate-light font-sans">/mo</span></div>
                  <p className="text-[13px] text-slate-light mb-6">100 replies/day default, cancel anytime.</p>
                  <a href="/onboard" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/20 text-white hover:border-white/40 ${btn}`}>
                    Choose monthly
                  </a>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">6 months</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 52,999</div>
                  <p className="text-[13px] text-slate-light mb-6">Includes infrastructure and maintenance.</p>
                  <a href="/onboard" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/20 text-white hover:border-white/40 ${btn}`}>
                    Choose 6 months
                  </a>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">One-time</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 50,000</div>
                  <p className="text-[13px] text-slate-light mb-6">+ Rs 5,499/mo from month 3, first 2 months free.</p>
                  <a href="/onboard" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/20 text-white hover:border-white/40 ${btn}`}>
                    Choose one-time
                  </a>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="px-6 pb-24 pt-12">
            <div className="max-w-6xl mx-auto">
              <div className="relative overflow-hidden rounded-[32px] bg-grad text-white text-center px-8 py-16">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_40%)] pointer-events-none" />
                <div className="relative z-10 max-w-xl mx-auto">
                  <h2 className="font-serif font-semibold text-[clamp(30px,4.2vw,46px)] tracking-tight mb-4">Never leave a good conversation waiting.</h2>
                  <p className="text-white/85 text-lg mb-8">Engage keeps you responsive, consistent, and unmistakably yourself.</p>
                  <a href="/setup" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-indigo-deep hover:-translate-y-0.5 hover:scale-[1.03] ${btn}`}>Start your free trial</a>
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
