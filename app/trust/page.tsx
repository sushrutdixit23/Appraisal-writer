import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Trust & Security - Zyntask",
  description: "How Engage handles your LinkedIn access, your account safety, and your data. Plain answers, not marketing language.",
};

export default function TrustPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-10">
            Trust & security
          </p>

          <h1 className="font-display font-bold text-[clamp(42px,6vw,72px)] tracking-tight leading-[1.02] text-ink mb-8">
            You are always<br />
            <span className="font-serif italic font-semibold">the last click.</span>
          </h1>

          <div className="space-y-6 mb-16">
            <p className="text-[19px] text-slate leading-relaxed">
              This page exists because most people asking these questions have been burned before by a tool that overstated what it does. Here is exactly what Engage does, in plain language, with nothing rounded up.
            </p>
          </div>

          <div className="h-px bg-line mb-16" />

          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo mb-4">Access & scope</p>
          <div className="space-y-6 mb-16">
            <p className="text-[17px] text-slate leading-relaxed">
              Connecting your LinkedIn account is something you initiate and can revoke at any time. Engage only ever sees what that connected account can already see on LinkedIn - your own messages, comments on your own posts, and public profiles. There is no separate, deeper access path.
            </p>
          </div>

          <div className="h-px bg-line mb-16" />

          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo mb-4">Account safety</p>
          <div className="space-y-6 mb-16">
            <p className="text-[17px] text-slate leading-relaxed">
              A daily send cap is built in and always on. It exists specifically to keep your activity inside what LinkedIn treats as normal usage, protecting your account's standing, not just managing load on our end.
            </p>
          </div>

          <div className="h-px bg-line mb-16" />

          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo mb-4">Human approval</p>
          <div className="space-y-6 mb-16">
            <p className="text-[17px] text-slate leading-relaxed">
              Nothing Engage drafts is sent, posted, or published without a person clicking approve first. Not a setting you can miss, not a default you have to turn off - there is no path in the product where a message leaves without that click.
            </p>
          </div>

          <div className="h-px bg-line mb-16" />

          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-indigo mb-4">Data handling</p>
          <div className="space-y-6 mb-16">
            <p className="text-[17px] text-slate leading-relaxed">
              Your writing samples and message history are used to make your own drafts sound like you. They are not used to train models outside your own account, and they are not shared with other Zyntask clients.
            </p>
          </div>

          <div className="h-px bg-line mb-16" />

          <div className="space-y-6">
            <p className="text-[19px] text-slate leading-relaxed">
              If something above stops being true, this page gets rewritten the same day, not quietly walked back. That is a higher bar than most tools hold themselves to, and it is the one we intend to keep.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
