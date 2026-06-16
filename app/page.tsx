import SiteNav from "./components/SiteNav";

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
            Engage<span style={{ color: "#8a6ff0" }}>.</span>
          </h1>
          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-slate-light mb-10">
            Your LinkedIn voice, on time — every time
          </p>

          <h2 className="font-display font-semibold tracking-tight leading-[1.1] text-[clamp(26px,3.6vw,38px)] mb-7 text-white/95 max-w-[20ch] mx-auto">
            You never miss a meaningful LinkedIn conversation.
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
              Three simple steps. Yours is the easy one.
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
        <div className="max-w-2xl mx-auto px-6 text-center">
          <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">
            Founding offer
          </span>
          <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] mb-5">
            The Founding Partnership.
          </h2>
          <p className="text-slate-light text-[17px] leading-relaxed max-w-[48ch] mx-auto mb-12">
            We're taking on a small number of founding clients — direct access to me, permanent pricing locked in for as long as you stay, and a system tuned around your actual results.
          </p>

          <div className="bg-white/5 border border-white/10 rounded-[28px] p-9 md:p-11 text-left">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8 pb-8 border-b border-white/10">
              <div>
                <div className="font-serif font-semibold text-[48px] tracking-tight leading-none">
                  ₹49,000
                </div>
                <div className="text-sm text-slate-light mt-1.5">One-time setup</div>
              </div>
              <div className="text-right">
                <div className="font-serif font-semibold text-[34px] tracking-tight leading-none">
                  ₹7,500<span className="text-lg text-slate-light">/mo</span>
                </div>
                <div className="text-sm text-slate-light mt-1.5">Ongoing partnership</div>
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                "Full setup — connection, your voice, your dashboard",
                "Permanent founding-client pricing, for as long as you stay",
                "Direct access to me, not a support queue",
                "The system tuned and adjusted around your real usage",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-slate-light">
                  <span className="text-sky mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="bg-black/30 rounded-2xl px-6 py-5">
              <p className="text-[14.5px] text-slate-light leading-relaxed">
                <b className="text-white">Our promise:</b> if Engage isn't saving you real time within the first month, we keep refining it with you at no extra cost until it does.
              </p>
            </div>
          </div>

          <p className="text-[13px] text-slate-light mt-7">
            Open to the first few founding clients · running costs billed separately, at actual cost
          </p>
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
