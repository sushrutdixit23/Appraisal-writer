import SiteNav from "../components/SiteNav";

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
          <div className="font-serif italic text-[15px] tracking-wide text-slate-light mb-8">
            by <span className="text-white not-italic font-semibold">Zyntask</span>
          </div>

          <h1 className="font-serif font-semibold tracking-tight leading-[1.0] text-[clamp(52px,9vw,108px)] mb-3 text-white">
            Engage<span className="text-indigo-deep" style={{ color: "#8a6ff0" }}>.</span>
          </h1>
          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-slate-light mb-10">
            Your LinkedIn voice, on time — every time
          </p>

          <h2 className="font-display font-semibold tracking-tight leading-[1.1] text-[clamp(26px,3.6vw,38px)] mb-7 text-white/95 max-w-[18ch] mx-auto">
            An assistant that replies for you, in your own words.
          </h2>
          <p className="text-[18px] text-slate-light max-w-[50ch] mx-auto mb-10 leading-relaxed">
            Engage watches your comments and messages, writes thoughtful replies that sound like you, and lines them up for a quick yes before anything is sent.
          </p>
          <a href="mailto:hello@zyntask.in" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-medium bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg transition-all">
            Talk to us about Engage →
          </a>
        </div>
      </header>

      <section className="py-24 bg-mist">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] mb-5 text-ink">
            Stay present on LinkedIn without living in it.
          </h2>
          <p className="text-lg text-slate leading-relaxed mb-4">
            A strong presence on LinkedIn runs on replies — to the people who comment on your posts, and the ones who reach out directly. But keeping up takes real time, and the moment you fall behind, conversations cool off and opportunities quietly slip away.
          </p>
          <p className="text-lg text-slate leading-relaxed">
            Engage takes that weight off your day. It keeps an eye on your inbox and your posts around the clock, understands what each message is really asking, and prepares a reply written in your voice. All that's left for you is the easy part: a glance, and a yes.
          </p>
        </div>
      </section>

      <section className="py-24 bg-ink text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[660px] mx-auto mb-14 text-center">
            <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">How it works</span>
            <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)]">
              Three simple steps, and only one of them is yours.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "i", title: "It watches", body: "Engage quietly checks your direct messages and the comments on your recent posts, all day long. Nothing slips past, even the notes that arrive at 2 a.m." },
              { n: "ii", title: "It drafts", body: "For each new message, it works out what the person needs and writes a reply in your tone, ready to send. Spam and bulk promotions are set aside automatically." },
              { n: "iii", title: "You approve", body: "Every draft waits for you in one simple screen. Read it, send it as-is, adjust a word, or skip it. Nothing leaves your account until you say so." },
            ].map((step) => (
              <div key={step.n} className="bg-white/5 border border-white/10 rounded-[20px] p-7">
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
            <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] text-ink">
              Five promises that protect you and your account.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: "Nothing sends without you", body: "Every single reply is read and approved by you before it goes out. There is no setting that lets it send on its own." },
              { title: "A daily limit, always on", body: "Engage will never send more than a set number of messages a day, keeping your activity well inside what LinkedIn considers normal." },
              { title: "Spam stays out", body: "Promotional blasts, cold sales pitches, and messages from company pages are filtered out and never get an automatic reply in your name." },
              { title: "Big moments come to you", body: "Any message about a call, a meeting, or working together is always set aside for your personal attention." },
            ].map((g) => (
              <div key={g.title} className="bg-cloud border border-line rounded-[20px] p-7">
                <h3 className="font-semibold text-[17px] mb-2 text-ink">{g.title}</h3>
                <p className="text-[14.5px] text-slate leading-relaxed">{g.body}</p>
              </div>
            ))}
          </div>
          <div className="bg-cloud border border-line rounded-[20px] p-7 mt-5">
            <h3 className="font-semibold text-[17px] mb-2 text-ink">It sounds like you — because it learns from you</h3>
            <p className="text-[14.5px] text-slate leading-relaxed">Before it writes a word, Engage is tuned using real examples of how you actually reply. The result reads like you on a good day, not like a robot. And since you approve everything, you always have the final edit.</p>
          </div>
        </div>
      </section>

      <section className="py-24 bg-ink text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">Investment</span>
          <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] mb-10">
            Straightforward pricing, a fraction of the usual cost.
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-[24px] overflow-hidden text-left">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-9 md:border-r border-white/10">
                <div className="text-xs tracking-[0.2em] uppercase text-slate-light mb-3">One-time setup</div>
                <div className="font-serif font-semibold text-[44px] tracking-tight">$1,200</div>
                <div className="text-sm text-slate-light mt-1 mb-4">Paid once, at the start</div>
                <p className="text-[14px] text-slate-light leading-relaxed">The complete system, built and configured for your account — connection, your voice, your dashboard, and a guided launch.</p>
              </div>
              <div className="p-9">
                <div className="text-xs tracking-[0.2em] uppercase text-slate-light mb-3">Monthly</div>
                <div className="font-serif font-semibold text-[44px] tracking-tight">$150</div>
                <div className="text-sm text-slate-light mt-1 mb-4">Per month, ongoing</div>
                <p className="text-[14px] text-slate-light leading-relaxed">Keeping everything running, monitored, and tuned — plus support whenever you need it.</p>
              </div>
            </div>
            <div className="bg-black/30 text-slate-light text-[13.5px] leading-relaxed px-9 py-6">
              <b className="text-white">Running costs are separate and modest.</b> The AI and connection services Engage relies on are billed at actual cost — typically a small monthly amount that scales with how much you use it.
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 bg-mist pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-[32px] bg-grad text-white text-center px-8 py-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_40%)]" />
            <div className="relative z-10 max-w-xl mx-auto">
              <h2 className="font-serif font-semibold text-[clamp(30px,4.2vw,46px)] tracking-tight mb-4">
                Never leave a good conversation waiting.
              </h2>
              <p className="text-white/85 text-lg mb-8">
                Engage keeps you responsive, consistent, and unmistakably yourself.
              </p>
              <a href="mailto:hello@zyntask.in" className="inline-flex px-7 py-3.5 rounded-[13px] text-base font-semibold bg-white text-indigo-deep hover:-translate-y-0.5 transition-all">
                Talk to us →
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}