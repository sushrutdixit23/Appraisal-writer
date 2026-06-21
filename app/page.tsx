import SiteNav from "./components/SiteNav";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />

      <div className="relative z-10">
        <SiteNav />

        <header className="relative pt-[70px] pb-24">
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-16">
            <span className="inline-flex items-center gap-2 bg-cloud/80 backdrop-blur-sm border border-line px-4 py-1.5 rounded-full shadow-zy-sm text-ink-soft font-mono text-[11.5px] tracking-wide uppercase mb-7">
              Supervised AI · Built around you
            </span>

            <h1 className="font-serif font-semibold tracking-tight leading-[1.05] text-[clamp(40px,6vw,68px)] mb-6 text-ink">
              Zyntask <span className="text-grad">— your professional co-pilot.</span>
            </h1>

            <p className="text-[19px] text-slate max-w-[42ch] mx-auto mb-9 leading-relaxed">
              AI that drafts the work. You make every call.
            </p>

            <div className="flex gap-3.5 flex-wrap items-center justify-center">
              <a href="/engage" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-semibold bg-grad text-white shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_28px_rgba(91,75,255,0.45)] transition-all">
                See Engage in action
              </a>
              <a href="#how" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-semibold text-ink hover:text-indigo transition-colors">
                How it works ↓
              </a>
            </div>
          </div>
        </header>

        <section className="py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-[640px] mx-auto mb-14 text-center">
              <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-3.5">
                The difference
              </span>
              <h2 className="font-display font-bold tracking-tight leading-[1.06] text-[clamp(28px,3.5vw,42px)] text-ink">
                Most AI tools want full control. We don't think that's right.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { title: "Drafts, never decides", body: "Every output is prepared, not sent. You review before anything goes out — human-in-the-loop, not best-effort automation." },
                { title: "Built on your voice", body: "Not a generic model. Tuned from real examples of how you actually write and work, not a template." },
                { title: "Visible, not a black box", body: "See exactly what's queued, what's pending, and what's been sent — structured and always in view." },
              ].map((item) => (
                <div key={item.title} className="bg-cloud/85 backdrop-blur-md border border-line rounded-[20px] p-7 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                  <h3 className="font-display font-semibold text-[17px] tracking-tight mb-2 text-ink">
                    {item.title}
                  </h3>
                  <p className="text-[14.5px] text-slate leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-[660px] mx-auto mb-14 text-center">
              <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-3.5">
                How an agent works
              </span>
              <h2 className="font-display font-bold tracking-tight leading-[1.06] text-[clamp(30px,3.8vw,46px)] text-ink">
                Four steps. One of them is yours.
              </h2>
              <p className="text-slate text-lg mt-4">
                Every Zyntask agent is built around the same promise — review before anything reaches anyone.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {[
                { n: "01", icon: "👀", title: "Watch", body: "The agent quietly keeps an eye on the work — messages, comments, whatever it's built to catch. Nothing slips through." },
                { n: "02", icon: "✍️", title: "Draft", body: "It works out what's needed and prepares a response in your voice — ready to go, never sent on its own." },
                { n: "03", icon: "✅", title: "Approve", body: "You read it, edit if you want, and decide. Nothing reaches anyone without your yes." },
                { n: "04", icon: "🔁", title: "Repeat", body: "It keeps running, quietly, in the background — building a queue, never a backlog." },
              ].map((step) => (
                <div key={step.n} className="bg-cloud/85 backdrop-blur-md border border-line rounded-[24px] p-6 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                  <div className="flex items-center gap-2 text-indigo font-mono text-xs tracking-wide mb-4">
                    <span>{step.n}</span>
                    <span className="flex-1 h-px bg-line" />
                  </div>
                  <div className="w-[42px] h-[42px] rounded-xl bg-mist flex items-center justify-center mb-4 text-xl">
                    {step.icon}
                  </div>
                  <h3 className="font-display font-semibold text-[19px] tracking-tight mb-2 text-ink">
                    {step.title}
                  </h3>
                  <p className="text-[14.5px] text-slate leading-relaxed">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="engage" className="py-24 pt-0">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-[660px] mx-auto mb-14 text-center">
              <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-3.5">
                The flagship
              </span>
              <h2 className="font-display font-bold tracking-tight leading-[1.06] text-[clamp(30px,3.8vw,46px)] text-ink">
                <span className="font-serif italic">Engage.</span> Never miss a warm lead on LinkedIn again.
              </h2>
              <p className="text-slate text-lg mt-4">
                Reads your DMs and comments, drafts replies in your voice, and waits for your yes before anything is sent.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4.5">
              <div className="md:col-span-4 bg-cloud/85 backdrop-blur-md border border-line rounded-[24px] p-7 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                <span className="inline-flex items-center gap-1.5 text-indigo font-mono text-[10.5px] tracking-wide uppercase mb-3.5">
                  ● Your approval queue
                </span>
                <h3 className="font-display font-semibold text-[21px] tracking-tight mb-2.5 text-ink">
                  One screen. A few minutes. Done.
                </h3>
                <p className="text-[15px] text-slate leading-relaxed mb-5">
                  Everything waiting for you, with the message, the classification, and the drafted reply — ready to approve or skip.
                </p>

                <div className="rounded-2xl border border-line bg-mist overflow-hidden">
                  <div className="h-9 bg-ink flex items-center px-3.5 gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3a3845]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3a3845]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3a3845]" />
                    <span className="ml-2 font-serif text-[15px] text-[#cdc8be]">Engage<span className="text-indigo">.</span></span>
                    <span className="ml-auto text-[10px] text-[#8884a0]">Sent today &nbsp;6 / 100</span>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-slate-light mb-1">Amrish Kumar Choubey · Comment</div>
                    <div className="text-[13px] text-ink-soft bg-cloud border border-line-soft rounded-lg px-3 py-2 mb-3">
                      Keep learning. Proud of you 🙏
                    </div>
                    <div className="text-[9px] uppercase tracking-wide text-slate-light mb-1.5">Reply prepared for you</div>
                    <div className="text-[13px] text-ink bg-white border border-line rounded-lg px-3 py-2.5 leading-relaxed">
                      Thank you so much, Amrish sir — that truly means a lot coming from you. Your encouragement keeps me pushing further. 🙏
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 bg-ink text-white rounded-[24px] p-7 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                <span className="inline-flex items-center gap-1.5 text-sky font-mono text-[10.5px] tracking-wide uppercase mb-3.5">
                  ● The one rule
                </span>
                <h3 className="font-display font-semibold text-[21px] tracking-tight mb-2.5">
                  Drafting is automatic. Sending never is.
                </h3>
                <p className="text-[14.5px] text-slate-light leading-relaxed">
                  Every reply is read and approved by a real person before it reaches anyone — human-in-the-loop, always. There is no setting that changes that.
                </p>
              </div>

              <div className="md:col-span-3 bg-cloud/85 backdrop-blur-md border border-line rounded-[24px] p-7 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                <span className="inline-flex items-center gap-1.5 text-indigo font-mono text-[10.5px] tracking-wide uppercase mb-3.5">
                  ● Account safety
                </span>
                <h3 className="font-display font-semibold text-[19px] tracking-tight mb-2.5 text-ink">
                  A daily limit, always on.
                </h3>
                <p className="text-[14.5px] text-slate leading-relaxed">
                  Sending stays well inside what LinkedIn considers normal activity — no matter how full the queue gets.
                </p>
              </div>

              <div className="md:col-span-3 bg-cloud/85 backdrop-blur-md border border-line rounded-[24px] p-7 hover:-translate-y-1 hover:shadow-zy-md transition-all">
                <span className="inline-flex items-center gap-1.5 text-indigo font-mono text-[10.5px] tracking-wide uppercase mb-3.5">
                  ● Sounds like you
                </span>
                <h3 className="font-display font-semibold text-[19px] tracking-tight mb-2.5 text-ink">
                  Tuned to your voice, not a template.
                </h3>
                <p className="text-[14.5px] text-slate leading-relaxed">
                  Set up using real examples of how you actually write — then refined every time you edit a draft.
                </p>
              </div>
            </div>

            <div className="text-center mt-10">
              <a href="/engage" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-semibold bg-grad text-white shadow-[0_6px_18px_rgba(91,75,255,0.35)] hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_28px_rgba(91,75,255,0.45)] transition-all">
                See the full Engage guide →
              </a>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="max-w-6xl mx-auto">
            <div className="relative overflow-hidden rounded-[32px] bg-grad text-white text-center px-8 py-16 md:py-20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_40%),radial-gradient(circle_at_90%_90%,rgba(0,0,0,0.12),transparent_45%)]" />
              <div className="relative z-10 max-w-xl mx-auto">
                <h2 className="font-display font-bold text-[clamp(30px,4vw,46px)] tracking-tight mb-4">
                  Stay calm. Stay in sync. Get it done.
                </h2>
                <p className="text-white/85 text-lg mb-8">
                  Tell us what's eating your time — there's probably an agent for that.
                </p>
                <a href="mailto:hello@zyntask.in" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-semibold bg-white text-indigo-deep hover:-translate-y-0.5 hover:scale-[1.03] transition-all">
                  Talk to us →
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="pt-0 pb-10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-11 border-b border-line">
              <div className="col-span-2">
                <a href="/" className="flex items-center gap-2.5 font-display font-bold text-xl text-ink mb-4">
                  <span className="w-7.5 h-7.5 rounded-[9px] bg-grad flex items-center justify-center shadow-zy-sm">
                    <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-white stroke-[2.6] fill-none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 10.5 8.5 15 16 5.5" />
                    </svg>
                  </span>
                  Zyntask
                </a>
                <p className="text-slate text-sm max-w-[30ch]">
                  Your professional co-pilot — AI that drafts the work, you make every call.
                </p>
              </div>
              <div>
                <h5 className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-4">Agents</h5>
                <a href="/engage" className="block text-ink-soft text-[14.5px] mb-2.5 hover:text-indigo transition-colors">Engage</a>
                <a href="/appraisal-writer" className="block text-ink-soft text-[14.5px] mb-2.5 hover:text-indigo transition-colors">Appraisal Writer</a>
              </div>
              <div>
                <h5 className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-4">Company</h5>
                <a href="mailto:hello@zyntask.in" className="block text-ink-soft text-[14.5px] mb-2.5 hover:text-indigo transition-colors">Contact</a>
                <a href="mailto:support@zyntask.in" className="block text-ink-soft text-[14.5px] mb-2.5 hover:text-indigo transition-colors">Support</a>
              </div>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3.5 pt-6">
              <small className="text-slate text-[13px]">© 2026 Zyntask</small>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
