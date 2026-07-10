import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Engage by Zyntask - Your LinkedIn presence, on autopilot, with you in control",
  description: "Engage drafts your replies, plans your posts, and learns your voice - then waits for your approval before anything goes out. Start with a free trial.",
};
import EngageNav from "../components/EngageNav";
import Reveal from "../components/Reveal";
import EngageHeroDemo from "../components/EngageHeroDemo";

const btn = "font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]";

export default function EngagePage() {
  return (
    <main className="relative min-h-screen bg-ink overflow-x-hidden overflow-y-auto no-scrollbar" style={{ height: "100vh" }}>
      <div className="aurora-page-dark" />
      <div className="relative z-10">
        <EngageNav />

        <header className="relative pt-[70px] pb-24 text-white">
          <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div className="text-center md:text-left">
              <div className="font-serif italic text-[14px] tracking-wide text-slate-light mb-7">by <span className="text-white not-italic font-semibold">Zyntask</span></div>
              <h1 className="font-display font-bold tracking-tight leading-[1.06] text-[clamp(34px,4.6vw,54px)] mb-6 text-white">
                Reply faster. Stay consistent.<br />Keep every decision <span style={{ color: "#8a6ff0" }}>yours</span>.
              </h1>
              <p className="text-[17px] text-slate-light max-w-[46ch] mx-auto md:mx-0 mb-9 leading-relaxed">
                Engage drafts replies, comments and posts in your own voice while you stay in complete control. No autonomous sending. No generic AI.
              </p>
              <div className="flex gap-3.5 flex-wrap items-center justify-center md:justify-start">
                <a href="/setup" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg ${btn}`}>Start free trial</a>
                <a href="#how" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base text-white border border-white/20 hover:border-white/40 ${btn}`}>See how it works</a>
              </div>
            </div>

            <EngageHeroDemo />
          </div>
        </header>

        <Reveal>
          <section id="features" className="py-20">
            <div className="max-w-6xl mx-auto px-6">
              <div className="max-w-[620px] mx-auto mb-14 text-center">
                <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">Major features</span>
                <h2 className="font-serif font-semibold tracking-tight text-[clamp(28px,3.6vw,42px)] text-white">What Engage actually does for you.</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: "M4 8h8M4 12h5M4 16h8M15 6l3 3-3 3", title: "Bulk approve, in seconds", body: "Clear a full queue at once. Anything that needs your personal attention is automatically excluded." },
                  { icon: "M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5-8-5.5-8-5.5zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", title: "Preview before you send", body: "See exactly how a reply, comment, or post will look - not just raw text in a box." },
                  { icon: "M10 2a8 8 0 100 16 8 8 0 000-16zm0 4v4l2.5 2.5", title: "Lead temperature, at a glance", body: "Hot, warm, or cold, with the reasoning shown - never a guess you have to trust blindly." },
                  { icon: "M10 2c-2 3-3 5.5-3 8a3 3 0 006 0c0-2.5-1-5-3-8z", title: "Learns your real voice", body: "Built from your actual writing samples, refined a little more with every edit you make." },
                  { icon: "M6 8l-3 3 3 3M3 11h9a4 4 0 004-4", title: "Replies to your replies", body: "When someone responds to your own comment, Engage catches it and drafts the follow-up - not just first contact." },
                  { icon: "M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M14.5 5.5l-2 2M7.5 12.5l-2 2", title: "Comment opportunities, on your terms", body: "Pick exactly who to watch. Skips a post entirely when there is nothing real to say." },
                  { icon: "M10 2l6.5 3v5c0 4.5-2.8 7-6.5 8-3.7-1-6.5-3.5-6.5-8V5L10 2z", title: "A daily send cap, always on", body: "Stays well inside what LinkedIn treats as normal activity - no matter how full the queue gets." },
                  { icon: "M10 6v5M10 14h.01M10 2a8 8 0 100 16 8 8 0 000-16z", title: "Full reasoning, never a black box", body: "Every classification comes with the plain-language why behind it, visible on every item." },
                ].map((f) => (
                  <div key={f.title} className="relative rounded-[22px] p-6 overflow-hidden transition-all duration-300 hover:-translate-y-1"
                    style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(20px)" }}>
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle, rgba(138,111,240,0.25), transparent 70%)" }} />
                    <div className="relative w-9 h-9 rounded-[10px] flex items-center justify-center mb-4" style={{ background: "rgba(138,111,240,0.12)" }}>
                      <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 stroke-[#a996ff] stroke-[1.7] fill-none" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                    </div>
                    <h3 className="relative font-display font-semibold text-[15.5px] text-white mb-2 tracking-tight leading-snug">{f.title}</h3>
                    <p className="relative text-[13px] text-slate-light leading-relaxed">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-3xl mx-auto px-6 text-center">
              <h2 className="font-display font-bold tracking-tight text-[clamp(28px,3.5vw,40px)] mb-5 text-white">Stay present without living in your inbox.</h2>
              <p className="text-lg text-slate-light leading-relaxed mb-4">A strong presence on LinkedIn runs on two things - showing up consistently, and replying when people respond. Both are a job in themselves.</p>
              <p className="text-lg text-slate-light leading-relaxed">Engage takes both off your plate. It plans what to post, drafts your replies, and hands you a short queue to approve - so your presence stays consistent without taking your day.</p>
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
                  { n: "i", title: "It watches and plans", body: "Engage checks your messages and comments, and surfaces what to post about - so nothing meaningful slips by and you're never staring at a blank box." },
                  { n: "ii", title: "It drafts", body: "For every reply and every post, it writes in your voice - ready to go, never sent on its own." },
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
                <p className="text-slate-light text-[16px] mt-4 leading-relaxed max-w-[52ch] mx-auto">Not every message is equal. Engage reads intent and tells you where the real opportunities are - so your time goes to the conversations that matter.</p>
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
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-10 items-center">
                <div>
                  <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">The part that compounds</span>
                  <h2 className="font-serif font-semibold tracking-tight text-[clamp(28px,3.6vw,42px)] mb-5 text-white">It sounds more like you every week.</h2>
                  <p className="text-[16px] text-slate-light leading-relaxed mb-4">Most AI writing tools produce the same generic voice for everyone. Engage learns yours from your last 100 messages in under 60 seconds, then gets sharper every time you edit a draft.</p>
                  <p className="text-[16px] text-slate-light leading-relaxed">This is not a setting you configure once. It is a profile that keeps building - your tone, your phrasing, your rhythm - and it is yours to see and edit at any time, never a black box.</p>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-[24px] p-7">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate-light">Voice profile strength</span>
                    <span className="font-serif font-semibold text-[26px] text-white">87%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-5">
                    <div className="h-full rounded-full" style={{ width: "87%", background: "linear-gradient(115deg,#5B4BFF,#8a6ff0)" }} />
                  </div>
                  <div className="space-y-2.5">
                    {[
                      "Tone calibrated from your own writing",
                      "Sign-off and rhythm learned, not guessed",
                      "Sharpens with every edit you make",
                    ].map((line) => (
                      <div key={line} className="flex items-start gap-2.5">
                        <svg viewBox="0 0 20 20" className="w-4 h-4 mt-0.5 stroke-[#8a6ff0] stroke-[2.5] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
                        <p className="text-[13.5px] text-white/80">{line}</p>
                      </div>
                    ))}
                  </div>
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
                  <p className="text-[15px] text-slate-light leading-relaxed">No onboarding calls to wait for. Connect your LinkedIn securely and Engage scans your last 100 sent messages to learn your tone in under 60 seconds - your free trial begins the moment you are set up, all from your own dashboard.</p>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="pt-4 pb-24">
            <div className="max-w-3xl mx-auto px-6 flex items-center justify-center gap-4 text-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(115deg,#0A66C2,#5B4BFF)" }}>
                <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-white stroke-[2.5] fill-none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5 8.5 15 16 5.5" />
                </svg>
              </div>
              <p className="text-[15px] text-white/80">Nothing sends without you - every reply and post is approved by you, always. No setting changes that.</p>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-4xl mx-auto px-6 text-center">
              <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">Beyond content generated</span>
              <h2 className="font-serif font-semibold tracking-tight text-[clamp(28px,3.6vw,42px)] mb-5 text-white">What matters isn't what got posted. It's what it led to.</h2>
              <p className="text-slate-light text-[16px] leading-relaxed max-w-[58ch] mx-auto mb-10">Mark any conversation as a win - a client, a meeting, a referral - and Engage keeps a running record. Not impressions. Outcomes.</p>
              <div className="inline-flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-[18px] px-7 py-5">
                <span className="font-serif font-semibold text-[30px] text-white">3</span>
                <span className="text-[14px] text-slate-light text-left leading-snug">conversations<br/>became business<br/>this month</span>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-24">
            <div className="max-w-5xl mx-auto px-6">
              <div className="max-w-[640px] mx-auto mb-14 text-center">
                <span className="block font-mono text-sky text-xs tracking-[0.12em] uppercase mb-3.5">What this replaces</span>
                <h2 className="font-serif font-semibold tracking-tight text-[clamp(30px,4vw,46px)] mb-5 text-white">The honest comparison.</h2>
                <p className="text-slate-light text-[16px] leading-relaxed max-w-[52ch] mx-auto">Here is what a consistent, well-managed LinkedIn presence normally costs, and what you actually get for it.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/[0.04] border border-white/10 rounded-[20px] p-6">
                  <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-light mb-3">Ghostwriter</p>
                  <p className="font-serif font-semibold text-[26px] text-white mb-1">Rs 20-50k<span className="text-[13px] text-slate-light font-sans">/mo</span></p>
                  <p className="text-[13px] text-slate-light leading-relaxed">You brief them, they write, you still review everything before it goes out. Slow turnaround, limited by one writer.</p>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-[20px] p-6">
                  <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-light mb-3">Social media VA</p>
                  <p className="font-serif font-semibold text-[26px] text-white mb-1">Rs 15-30k<span className="text-[13px] text-slate-light font-sans">/mo</span></p>
                  <p className="text-[13px] text-slate-light leading-relaxed">Your time to manage, their time to execute. Still needs your eyes on every reply and every post.</p>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-[20px] p-6">
                  <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-light mb-3">Automation tools</p>
                  <p className="font-serif font-semibold text-[26px] text-white mb-1">$99<span className="text-[13px] text-slate-light font-sans">/mo</span></p>
                  <p className="text-[13px] text-slate-light leading-relaxed">Tools like Expandi or Lemlist send without you reading it first. Built for volume, not judgment, and it risks the account.</p>
                </div>
                <div className="relative rounded-[20px] p-6" style={{ background: "linear-gradient(150deg, rgba(91,75,255,0.14), rgba(138,111,240,0.06))", border: "1px solid rgba(122,108,255,0.35)" }}>
                  <span className="absolute -top-3 left-6 bg-indigo text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">Engage</span>
                  <p className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-light mb-3 mt-2">Engage, Basic</p>
                  <p className="font-serif font-semibold text-[26px] text-white mb-1">Rs 3,999<span className="text-[13px] text-slate-light font-sans">/mo</span></p>
                  <p className="text-[13px] text-white/85 leading-relaxed">Drafts everything in your voice, replies and posts alike. Nothing sends without you reading it first. Always.</p>
                </div>
              </div>
              <p className="text-center text-[13px] text-slate-light mt-8 max-w-[56ch] mx-auto">This is not about being the cheapest option. It is that the two ways to spend less, a script that sends without you, or an outreach tool built for volume over judgment, are also the two ways to put your name on something you never actually approved.</p>
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

              <div className="relative overflow-hidden rounded-[28px] p-9 md:p-10 mb-10 text-center" style={{ background: "linear-gradient(125deg,#5B4BFF,#8a6ff0)" }}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_45%)] pointer-events-none" />
                <div className="relative z-10">
                  <span className="inline-block font-mono text-[11px] tracking-[0.12em] uppercase bg-white/20 px-3 py-1 rounded-full mb-4 text-white">Try it first</span>
                  <h3 className="font-serif font-semibold text-[34px] mb-2 text-white">Free trial</h3>
                  <p className="text-white/85 text-[15px] mb-7">A week, free, full access, no payment.</p>
                  <a href="/setup" className={`inline-flex px-7 py-3.5 rounded-[13px] text-base bg-white text-ink hover:-translate-y-0.5 hover:shadow-zy-lg ${btn}`}>
                    Start free trial
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white/[0.05] border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">Basic</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 3,999<span className="text-[15px] text-slate-light font-sans">/mo</span></div>
                  <p className="text-[13px] text-slate-light mb-1">Rs 39,990/yr - 2 months free</p>
                  <p className="text-[12px] text-indigo italic mb-5">Help me stay consistently visible.</p>
                  <ul className="space-y-2 mb-6">
                    {["Reply drafting for DMs and comments", "Post drafting, 3 ideas a week", "Scheduling and content calendar", "Approval-first workflow", "Basic analytics", "One LinkedIn profile"].map(f => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-slate-light leading-relaxed">
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 mt-0.5 stroke-indigo stroke-[2.5] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="/onboard" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/20 text-white hover:border-white/40 ${btn}`}>
                    Choose Basic
                  </a>
                </div>

                <div className="relative bg-white/[0.08] border border-indigo/40 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wide">Most popular</span>
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">Professional</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 8,999<span className="text-[15px] text-slate-light font-sans">/mo</span></div>
                  <p className="text-[13px] text-slate-light mb-1">Rs 89,990/yr - 2 months free</p>
                  <p className="text-[12px] text-indigo italic mb-5">Help me run my communication workflow.</p>
                  <ul className="space-y-2 mb-6">
                    {["Everything in Basic", "Unlimited post ideas", "Comment opportunity detection", "Voice profile, visible and editable", "Repurpose old posts with fresh angles", "Outcome tracking", "Advanced analytics and best-time posting"].map(f => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-slate-light leading-relaxed">
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 mt-0.5 stroke-indigo stroke-[2.5] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="/onboard" className={`block text-center w-full py-2.5 rounded-xl text-[14px] text-white hover:opacity-90 ${btn}`} style={{background:"linear-gradient(115deg,#5B4BFF,#8a6ff0)"}}>
                    Choose Professional
                  </a>
                </div>

                <div className="bg-white/[0.05] border border-white/10 rounded-[22px] p-7 transition-all duration-300 hover:-translate-y-1">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-light mb-3">Founding Access</p>
                  <div className="font-serif font-semibold text-[32px] tracking-tight leading-none mb-1 text-white">Rs 60,000<span className="text-[15px] text-slate-light font-sans"> setup</span></div>
                  <p className="text-[13px] text-slate-light mb-1">Then Rs 5,999/mo, locked for life</p>
                  <p className="text-[12px] text-indigo italic mb-5">Help me operationalize this deeply.</p>
                  <ul className="space-y-2 mb-6">
                    {["Everything in Professional", "White-glove onboarding", "Voice and workflow tuned with you directly", "Founding-rate pricing locked permanently", "A direct line to the founder"].map(f => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-slate-light leading-relaxed">
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 mt-0.5 stroke-indigo stroke-[2.5] fill-none flex-shrink-0" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 5.5" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="mailto:hello@zyntask.in" className={`block text-center w-full py-2.5 rounded-xl text-[14px] border border-white/20 text-white hover:border-white/40 ${btn}`}>
                    Talk to us
                  </a>
                </div>
              </div>
              <p className="text-center text-[13px] text-slate-light mt-6">Running multiple LinkedIn profiles? <a href="mailto:hello@zyntask.in" className="text-indigo hover:underline font-medium">Talk to us</a> about per-seat agency pricing.</p>
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
                  <p className="text-white/85 text-lg mb-8">Engage keeps you visible, responsive, and unmistakably yourself.</p>
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
