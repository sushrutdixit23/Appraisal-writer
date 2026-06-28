import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Manifesto — Zyntask",
  description: "The principles behind Zyntask. Not automation. Co-intelligence. It drafts, it never decides.",
};

export default function ManifestoPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />

        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          {/* Eyebrow */}
          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-10">
            Company doctrine
          </p>

          {/* Title */}
          <h1 className="font-display font-bold text-[clamp(42px,6vw,72px)] tracking-tight leading-[1.02] text-ink mb-8">
            Not automation.<br />
            <span className="font-serif italic font-semibold">Co-intelligence.</span>
          </h1>

          {/* Opening */}
          <div className="space-y-6 mb-16">
            <p className="text-[19px] text-slate leading-relaxed">
              Everywhere we look, AI is being sold as a replacement. Replace the writer. Replace the analyst. Replace the person. Hand over the work and step back.
            </p>
            <p className="text-[19px] text-slate leading-relaxed">
              The cost of that is real — people losing jobs to systems that cannot be trusted to do them, models that hallucinate with confidence, black boxes with no explanation, tools quietly training on your data and your clients' with no one asking if that is okay.
            </p>
            <p className="text-[19px] text-slate leading-relaxed">
              The ask keeps growing. The trust is not.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-line mb-16" />

          {/* The belief */}
          <div className="mb-16">
            <h2 className="font-display font-bold text-[28px] tracking-tight text-ink mb-6">A different belief</h2>
            <p className="text-[19px] text-slate leading-relaxed mb-6">
              The most valuable thing AI can do for a professional is not act <em>for</em> them. It is to think <em>alongside</em> them — to carry the cognitive load, and hand the decision back to the person it belongs to.
            </p>
            <p className="text-[19px] text-slate leading-relaxed">
              That is the difference between outputs and identity.
            </p>
          </div>

          {/* Outputs vs identity — the pull quote */}
          <div className="bg-ink rounded-[24px] px-8 py-10 mb-16">
            <p className="font-display font-bold text-[22px] text-white leading-relaxed mb-4">
              Outputs commoditize. Anyone can wrap an AI and generate a response.
            </p>
            <p className="text-[17px] text-slate-light leading-relaxed">
              But a system that learns how <em>you</em> actually work — your tone, your rhythm, your professional instincts — and compounds every time you use it? That becomes infrastructure. That is what serious workflow companies are built on.
            </p>
          </div>

          {/* The name */}
          <div className="mb-16">
            <h2 className="font-display font-bold text-[28px] tracking-tight text-ink mb-8">The name</h2>
            <div className="space-y-6">
              <div className="flex gap-6">
                <span className="font-display font-bold text-[20px] text-indigo w-16 flex-shrink-0 pt-0.5">Zen</span>
                <p className="text-[17px] text-slate leading-relaxed">Work should not feel like drowning. Calm and clarity over chaos.</p>
              </div>
              <div className="flex gap-6">
                <span className="font-display font-bold text-[20px] text-indigo w-16 flex-shrink-0 pt-0.5">Sync</span>
                <p className="text-[17px] text-slate leading-relaxed">You and your tools, moving together. Not one replacing the other.</p>
              </div>
              <div className="flex gap-6">
                <span className="font-display font-bold text-[20px] text-indigo w-16 flex-shrink-0 pt-0.5">Task</span>
                <p className="text-[17px] text-slate leading-relaxed">Because at the end of it all, the work still has to get done.</p>
              </div>
            </div>
          </div>

          {/* The mantra */}
          <div className="mb-16 text-center py-10">
            <p className="font-serif italic font-semibold text-[clamp(32px,4vw,48px)] text-ink leading-[1.2]">
              Stay calm.<br />Stay in sync.<br />Get it done.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-line mb-16" />

          {/* The three rules */}
          <div className="mb-16">
            <h2 className="font-display font-bold text-[28px] tracking-tight text-ink mb-8">
              Three rules. No exceptions.
            </h2>
            <div className="space-y-8">
              <div>
                <p className="font-display font-semibold text-[19px] text-ink mb-2">
                  It drafts, it never decides.
                </p>
                <p className="text-[17px] text-slate leading-relaxed">
                  Nothing is sent, posted, or submitted without a deliberate yes from you. Not as a setting. As a rule. The approval step is not a feature that can be turned off — it is the architecture.
                </p>
              </div>
              <div>
                <p className="font-display font-semibold text-[19px] text-ink mb-2">
                  It sounds like you.
                </p>
                <p className="text-[17px] text-slate leading-relaxed">
                  Tuned from how you actually write, not a generic template. Every edit makes it sharper. Over time, the system learns your voice at a level a model trained on the internet never could. That is a relationship, not a feature.
                </p>
              </div>
              <div>
                <p className="font-display font-semibold text-[19px] text-ink mb-2">
                  Every action is visible.
                </p>
                <p className="text-[17px] text-slate leading-relaxed">
                  What was drafted, why it was classified that way, and what the suggested next step is — always in view. You are not trusting a result. You are reviewing a recommendation. There is a difference, and it matters.
                </p>
              </div>
            </div>
          </div>

          {/* Data commitment */}
          <div className="bg-cloud border border-line rounded-[20px] px-8 py-8 mb-16">
            <h3 className="font-display font-semibold text-[18px] text-ink mb-4">On your data</h3>
            <div className="space-y-3">
              {[
                "Your data is never used to train any model.",
                "No conversation is shared across accounts.",
                "Your data is isolated at the database level — one client cannot see another's.",
                "You can export or delete your data at any time.",
                "Nothing autonomous ever reaches anyone without your approval.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-indigo stroke-[2.5] fill-none flex-shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10.5 8.5 15 16 5.5" />
                  </svg>
                  <p className="text-[15px] text-slate leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* The moat */}
          <div className="mb-16">
            <h2 className="font-display font-bold text-[28px] tracking-tight text-ink mb-6">Why this is hard to copy</h2>
            <p className="text-[19px] text-slate leading-relaxed mb-6">
              Anyone can build a tool that generates AI responses. That is not the moat.
            </p>
            <p className="text-[19px] text-slate leading-relaxed mb-6">
              The moat is a system that learns <em>your</em> specific professional voice and compounds over time. It is approval-first as architecture, not as an optional control. It is full transparency as a default, not a setting buried in preferences.
            </p>
            <p className="text-[19px] text-slate leading-relaxed">
              The winners in AI will not be the most autonomous. They will be the most trusted. We are building for that world.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-line mb-16" />

          {/* Close */}
          <div className="mb-16">
            <p className="text-[19px] text-slate leading-relaxed mb-6">
              We are building Zyntask in the open, one agent at a time. Every agent follows these principles. If any of them ever compromises on approval, transparency, or voice — that is a failure, not a feature.
            </p>
            <p className="text-[19px] text-slate leading-relaxed">
              This is the foundation. Everything else is built on top of it.
            </p>
          </div>

          {/* Signature */}
          <p className="font-serif italic text-[22px] text-ink-soft">
            — Sushrut, Founder, Zyntask
          </p>

        </div>

        {/* Footer */}
        <footer className="pt-0 pb-10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center justify-between flex-wrap gap-3.5 pt-6 border-t border-line">
              <small className="text-slate text-[13px]">© 2026 Zyntask</small>
              <div className="flex gap-6">
                <a href="/" className="text-slate text-[13px] hover:text-indigo transition-colors">Home</a>
                <a href="/engage" className="text-slate text-[13px] hover:text-indigo transition-colors">Engage</a>
                <a href="mailto:hello@zyntask.in" className="text-slate text-[13px] hover:text-indigo transition-colors">Contact</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </main>
  );
}
