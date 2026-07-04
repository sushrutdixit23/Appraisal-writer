import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Everything Engage does - Zyntask",
  description: "A full breakdown of what Engage handles for you: replies, posts, scheduling, voice, comment opportunities, analytics, and the guardrails that keep you in control.",
};
import SiteNav from "../../components/SiteNav";
import Reveal from "../../components/Reveal";

const btn = "font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]";

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[20px] border border-white/[0.08] p-6" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)" }}>
      <div className="w-1.5 h-1.5 rounded-full mb-4" style={{ background: "#8a6ff0" }} />
      <h3 className="font-display font-semibold text-[16px] text-white mb-2 tracking-tight">{title}</h3>
      <p className="text-[14px] text-slate-light leading-relaxed">{body}</p>
    </div>
  );
}

function FeatureSection({ eyebrow, title, items }: { eyebrow: string; title: string; items: { title: string; body: string }[] }) {
  return (
    <Reveal>
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[600px] mb-12">
            <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-3.5">{eyebrow}</span>
            <h2 className="font-serif font-semibold tracking-tight text-[clamp(28px,3.6vw,40px)] text-white">{title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((it) => (
              <FeatureCard key={it.title} title={it.title} body={it.body} />
            ))}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

export default function EngageFeaturesPage() {
  return (
    <main className="relative min-h-screen bg-ink overflow-x-hidden">
      <div className="aurora-page-dark" />
      <div className="relative z-10">
        <SiteNav />

        <header className="relative pt-[70px] pb-16 text-white">
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-16">
            <span className="block text-indigo font-mono text-xs tracking-[0.12em] uppercase mb-4">Full feature list</span>
            <h1 className="font-serif font-semibold tracking-tight leading-[1.05] text-[clamp(38px,6vw,64px)] mb-6 text-white">Everything Engage does.</h1>
            <p className="text-[18px] text-slate-light max-w-[56ch] mx-auto leading-relaxed">Every capability below ships today. Nothing here is a roadmap item - it is what is actually running for people using Engage right now.</p>
          </div>
        </header>

        <FeatureSection
          eyebrow="Reply management"
          title="Every DM and comment, handled without losing your voice."
          items={[
            { title: "Reads everything, all day", body: "Watches your DMs and the comments on your posts around the clock, so nothing meaningful slips past." },
            { title: "Drafts in your real voice", body: "Replies are written from your actual writing samples and rules, not a generic AI tone." },
            { title: "Classifies with visible reasoning", body: "Every message is marked hot, warm, or cold, with a plain-language explanation of why." },
            { title: "Approval-first, always", body: "Nothing sends until you read it and say yes. Skip, edit, or approve on every single draft." },
            { title: "Learns from your real edits", body: "The feedback loop studies what you actually changed and why, not just how often you changed it." },
            { title: "Reach-strategy framing", body: "Comment replies are flagged with the reasoning that replying fast extends your post's reach." },
          ]}
        />

        <FeatureSection
          eyebrow="Post creation"
          title="From a blank page to a ready post in minutes."
          items={[
            { title: "Weekly post ideas", body: "Fresh topic suggestions grounded in your role and what you have already posted about." },
            { title: "Draft from a topic", body: "Give it a topic and optional notes, and get a full draft written in your voice." },
            { title: "Hook strength check", body: "Every draft self-assesses its opening two lines and suggests a sharper one if it is weak." },
            { title: "Repurpose engine", body: "Turn a post that landed well into a fresh angle, or turn an achievement into a post." },
            { title: "Attachments built in", body: "Drag, drop, or paste images and documents straight into a draft." },
          ]}
        />

        <FeatureSection
          eyebrow="Scheduling & calendar"
          title="Plan the week, then let it run."
          items={[
            { title: "Visual content calendar", body: "See drafted, scheduled, and published posts on one weekly view." },
            { title: "Best-time intelligence", body: "Suggested posting times come with the reasoning behind them, not just a clock." },
            { title: "Publishes itself", body: "Once approved and scheduled, a post goes out automatically at the right time." },
            { title: "First-hour nudge", body: "An email lands shortly after a post goes live, prompting you to catch early engagement." },
          ]}
        />

        <FeatureSection
          eyebrow="Voice & identity layer"
          title="The part every other agent reads from."
          items={[
            { title: "One voice profile", body: "Tone, sign-off, and rules that every Engage agent shares, editable anytime." },
            { title: "Separate post and reply voice", body: "Posts can carry a different tone from replies when you want the split." },
            { title: "Real writing samples", body: "Style is shaped by examples of how you actually write, not a generic persona." },
            { title: "Auto-refreshing samples", body: "Fresh examples are pulled from your own recently sent messages over time, spaced out so no single burst of atypical writing can skew your baseline." },
            { title: "Style fingerprinting", body: "Measurable traits - sentence length, contractions, how often you hedge - are drawn from real sent history, not guessed." },
            { title: "Honest memory view", body: "See real counts of what has been sent, your genuine edit rate, and vocabulary pulled from your own messages." },
          ]}
        />

        <FeatureSection
          eyebrow="Comment opportunities"
          title="Stay visible in the rooms that matter, on purpose."
          items={[
            { title: "You choose who to watch", body: "Pick specific people whose posts are worth a thoughtful comment from you." },
            { title: "Genuinely specific comments", body: "Drafts add a real perspective or question - never generic praise like \"Great post!\"" },
            { title: "Skips when there is nothing to say", body: "A post with no real discussion angle gets skipped rather than forced." },
            { title: "Capped by design", body: "A daily limit keeps this feeling like a deliberate visibility strategy, not automation running wild." },
          ]}
        />

        <FeatureSection
          eyebrow="Analytics"
          title="Tracks outcomes, not vanity numbers."
          items={[
            { title: "Real wins, not activity counts", body: "Mark any conversation as a win - a client, a meeting, a referral - and see it add up." },
            { title: "Lead temperature breakdown", body: "See how many hot, warm, and cold conversations you are actually holding." },
            { title: "Response time tracking", body: "Know how quickly you are actually responding, not just how much volume moved." },
          ]}
        />

        <FeatureSection
          eyebrow="Trust & safety"
          title="Built so you never wonder what it is doing."
          items={[
            { title: "Daily send cap, always on", body: "A hard limit on daily sends keeps activity well inside what LinkedIn treats as normal." },
            { title: "Spam filtered automatically", body: "Mass-promotional messages are recognized and handled without cluttering your queue." },
            { title: "High-stakes routed to you", body: "Anything proposing a call, meeting, or next step is always flagged for your direct attention." },
            { title: "Full reasoning, always visible", body: "Every classification comes with the plain-language reasoning behind it - nothing is a black box." },
          ]}
        />

        <Reveal>
          <section className="px-6 pb-24 pt-4">
            <div className="max-w-6xl mx-auto">
              <div className="relative overflow-hidden rounded-[32px] bg-grad text-white text-center px-8 py-16">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.18),transparent_40%)] pointer-events-none" />
                <div className="relative z-10 max-w-xl mx-auto">
                  <h2 className="font-serif font-semibold text-[clamp(30px,4.2vw,46px)] tracking-tight mb-4">See it running on your own profile.</h2>
                  <p className="text-white/85 text-lg mb-8">Start free. Nothing sends until you approve it.</p>
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
