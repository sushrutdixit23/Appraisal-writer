import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engage by Zyntask — Your LinkedIn voice, on time",
  description: "Engage watches your LinkedIn comments and messages, drafts replies in your voice, and waits for your approval before anything is sent. Start with a free trial.",
};

import SiteNav from "../components/SiteNav";

const btn = "font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]";

export default function EngagePage() {
  return (
    <main className="min-h-screen bg-ink overflow-x-hidden">
      <SiteNav />
      <header className="relative pt-[70px] pb-24 bg-ink text-white">
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[200px] -right-[120px] w-[620px] h-[620px] rounded-full bg-[radial-gradient(circle,rgba(91,75,255,0.28),transparent_62%)] blur-[20px]" />
          <div className="absolute -bottom-[260px] -left-[160px] w-[560px] h-[560px] rounded-full bg-[radial-gradient(circle,rgba(41,211,240,0.2),transparent_62%)] blur-[20px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-16">
          <div className="font-serif italic text-[15px] tracking-wide text-slate-light mb-8">by <span className="text-white not-italic font-semibold">Zyntask</span></div>
          <h1 className="font-serif font-semibold tracking-tight leading-[1.0] text-[clamp(52px,9vw,108px)] mb-3 text-white">Engage<span style={{ color: "#8a6ff0" }}>.</span></h1>
          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-slate-light mb-10">Your LinkedIn voice, on time -- every time</p>
          <h2 className="font-display font-semibold tracking-tight leading-[1.1] text-[clamp(26px,3.6vw,38px)] mb-7 text-white/95 max-w-[20ch] mx-auto">You never miss a meaningful LinkedIn conversation.</h2>
          <p className="text-[18px] text-slate-light max-w-[50ch] mx-auto mb-10 leading-relaxed">Engage watches your comments and messages, writes thoughtful replies that sound like you, and lines them up for a quick yes before anything is sent.</p>
          <a href="#pricing" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg ${btn}`}>Get started →</a>

          <div className="relative z-10 max-w-md mx-auto mt-16 text-left">
            <div className="bg-white/[0.06] border border-white/10 rounded-[20px] p-5 backdrop-blur-sm shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-2.5 mb-3.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-serif text-[13px] text-white flex-shrink-0" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }}>R</div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Rohan Desai</p>
                  <p className="text-[11px] text-slate-light">Founder, Stacked Labs</p>
                </div>
              </div>
              <p className="text-[13px] text-white/75 bg-black/25 rounded-xl px-3.5 py-2.5 mb-3.5 leading-relaxed">
                "Would love to explore working together — are you taking on clients this quarter?"
              </p>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-light mb-1.5">Drafted reply</div>
              <p className="text-[13px] text-white/90 leading-relaxed mb-4">
                Thanks so much, Rohan — really appreciate that. Yes, taking on a few new clients this quarter. Happy to set up a quick call to see if it's a fit?
              </p>
              <div className="flex gap-2 justify-end">
                <span className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/15 text-white/70">Skip</span>
                <div className="relative">
                  <div className="absolute inset-0 rounded-lg blur-md opacity-60 animate-pulse" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }} />
                  <span className="relative inline-block px-4 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)" }}>
                    Approve & send
                  </span>
                </div>
              </div>
            </div>
            <p className="text-center text-[11.5px] text-slate-light mt-3">This is what waits for you. One glance, one yes.</p>
          </div>
        </div>
      </header>

      <section className="py-24 bg-mist">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] mb-5 text-ink">Stay present on LinkedIn without living in it.</h2>
          <p className="text-lg text-slate leading-relaxed mb-4">A strong presence on LinkedIn runs on replies -- to the people who comment on your posts, and the ones who reach out directly. But keeping up takes real time, and the moment you fall behind, conversations cool off and opportunities quietly slip away.</p>
          <p className="text-lg text-slate leading-relaxed">Engage takes that weight off your day. It keeps an eye on your inbox and your posts around the clock, understands what each message is really asking, and prepares a reply written in your voice. All that's left for you is the easy part: a glance, and a yes.</p>
        </div>
      </section>

      <section className="py-24 bg-ink text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[660px] mx-auto mb-14 text-center">
            <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">How it works</span>
            <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)]">Three simple steps. Yours is the easy one.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "i", title: "It watches", body: "Engage quietly checks your direct messages and the comments on your recent posts, all day long. Nothing slips past, even the notes that arrive at 2 a.m." },
              { n: "ii", title: "It drafts", body: "For each new message, it works out what the person needs and writes a reply in your tone, ready to send. Spam and bulk promotions are set aside automatically." },
              { n: "iii", title: "You approve", body: "Every draft waits for you in one simple screen. Read it, send it as-is, adjust a word, or skip it. Nothing leaves your account until you say so." },
            ].map((step) => (
              <div key={step.n} className="bg-white/5 border border-white/10 rounded-[20px] p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-white/20 hover:bg-white/[0.07]">
                <div className="font-serif italic text-[#8a6ff0] text-4xl mb-3">{step.n}</div>
                <h3 className="font-semibold text-xl mb-2">{step.title}</h3>
                <p className="text-[15px] text-slate-light leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-mist">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[660px] mx-auto mb-14 text-center">
            <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-3.5">Built to be safe</span>
            <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] text-ink">The promise that protects you and your account.</h2>
          </div>

          <div className="relative overflow-hidden rounded-[24px] p-8 md:p-9 mb-5" style={{ background: "linear-gradient(115deg,#0d0d0d,#1a1530)" }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(91,75,255,0.25),transparent_55%)] pointer-events-none" />
            <div className="relative z-10 flex items-start gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
                <svg viewBox="0 0 20 20" className="w-5 h-5 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5 8.5 15 16 5.5" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-[19px] mb-1.5 text-white">Nothing sends without you</h3>
                <p className="text-[14.5px] text-white/75 leading-relaxed max-w-[60ch]">Every single reply is read and approved by you before it goes out. There is no setting that lets it send on its own. This is the whole premise of Engage, not a feature buried in the settings.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { title: "A daily limit, always on", body: "Engage will never send more than a set number of messages a day, keeping your activity well inside what LinkedIn considers normal." },
              { title: "Spam stays out", body: "Promotional blasts, cold sales pitches, and messages from company pages are filtered out and never get an automatic reply in your name." },
              { title: "Big moments come to you", body: "Any message about a call, a meeting, or working together is always set aside for your personal attention." },
            ].map((g) => (
              <div key={g.title} className="bg-cloud border border-line rounded-[20px] p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-zy-md">
                <h3 className="font-semibold text-[16px] mb-2 text-ink">{g.title}</h3>
                <p className="text-[14px] text-slate leading-relaxed">{g.body}</p>
              </div>
            ))}
          </div>

          <div className="bg-cloud border border-line rounded-[20px] p-7 mt-5">
            <h3 className="font-semibold text-[17px] mb-2 text-ink">It sounds like you -- because it learns from you</h3>
            <p className="text-[14.5px] text-slate leading-relaxed">Before it writes a word, Engage is tuned using real examples of how you actually reply. The result reads like you on a good day, not like a robot. And since you approve everything, you always have the final edit.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 bg-ink text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[640px] mx-auto mb-14 text-center">
            <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">Pricing</span>
            <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] mb-5">Start free. Stay only if it's working.</h2>
            <p className="text-slate-light text-[16px] leading-relaxed max-w-[50ch] mx-auto">Try Engage free for a week, no card required. If it's saving you real time, we'll talk through the plan that fits how you work.</p>
          </div>

          <div className="relative overflow-hidden rounded-[28px] p-9 md:p-10 mb-6 text-center" style={{ background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_45%)] pointer-events-none" />
            <div className="relative z-10">
              <span className="inline-block font-mono text-[11px] tracking-[0.12em] uppercase bg-white/20 px-3 py-1 rounded-full mb-4">Start here</span>
              <h3 className="font-serif font-semibold text-[34px] mb-2">Free trial</h3>
              <p className="text-white/85 text-[15px] mb-7">A week, free · up to 50 replies a day · full access, no payment</p>
              <a href="mailto:hello@zyntask.in" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-indigo-deep hover:-translate-y-0.5 ${btn}`}>
                Start free trial →
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white/5 border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">Monthly</p>
              <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1">Rs 8,999<span className="text-base text-slate-light font-sans">/mo</span></div>
              <p className="text-[13px] text-slate-light mb-6">100 replies/day default, cancel anytime</p>
              <a href="mailto:hello@zyntask.in" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/15 text-white hover:border-white/30 ${btn}`}>
                Talk to us
              </a>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">6 months</p>
              <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1">Rs 52,999</div>
              <p className="text-[13px] text-slate-light mb-6">Includes infrastructure and maintenance</p>
              <a href="mailto:hello@zyntask.in" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/15 text-white hover:border-white/30 ${btn}`}>
                Talk to us
              </a>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">One-time</p>
              <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1">Rs 50,000</div>
              <p className="text-[13px] text-slate-light mb-6">+ Rs 5,499/mo from month 3 -- first 2 months free.</p>
              <a href="mailto:hello@zyntask.in" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/15 text-white hover:border-white/30 ${btn}`}>
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 bg-mist pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-[32px] bg-grad text-white text-center px-8 py-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_40%)]" />
            <div className="relative z-10 max-w-xl mx-auto">
              <h2 className="font-serif font-semibold text-[clamp(30px,4.2vw,46px)] tracking-tight mb-4">Never leave a good conversation waiting.</h2>
              <p className="text-white/85 text-lg mb-8">Engage keeps you responsive, consistent, and unmistakably yourself.</p>
              <a href="mailto:hello@zyntask.in" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-indigo-deep hover:-translate-y-0.5 ${btn}`}>Talk to us</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
