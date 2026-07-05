import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Privacy Policy - Zyntask",
  description: "What Zyntask collects, how it's used, and how to delete or export it.",
};

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-6">Legal</p>
          <h1 className="font-display font-bold text-[clamp(34px,5vw,52px)] tracking-tight leading-[1.05] text-ink mb-4">Privacy Policy</h1>
          <p className="text-slate text-[14px] mb-14">Last updated July 2026. Contact hello@zyntask.in with any questions.</p>

          <div className="space-y-10">

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">What we collect</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                When you connect your LinkedIn account, Zyntask reads what that account can already see: your direct messages, comments on your own posts, and public profile information of people you interact with. We do not have any access beyond what your connected account itself has.
              </p>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                We also collect what you provide directly: your name and role, writing samples used to shape your voice profile, tone and style preferences, and payment details processed through our payment provider (we do not store your card details ourselves).
              </p>
              <p className="text-[16px] text-slate leading-relaxed">
                We collect basic usage data: which drafts you approve, edit, or skip, and why, since this is how Engage learns to sound like you.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">How we use it</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                Your data is used to draft replies and posts in your voice, to get better at matching your voice over time based on your own edits and sent messages, and to show you clear reasoning behind each classification and suggestion.
              </p>
              <p className="text-[16px] text-slate leading-relaxed">
                Your data is never used to train any AI model outside your own account, and is never shared with or visible to other Zyntask clients. Your data is isolated at the database level.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Who we share it with</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                We use a small number of infrastructure providers to run the product: Unipile for LinkedIn connectivity, Anthropic for AI drafting, Supabase for data storage, and Razorpay for payment processing. Each only receives what it needs to do its specific job.
              </p>
              <p className="text-[16px] text-slate leading-relaxed">
                We do not sell your data to anyone, for any reason.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Your control over your data</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                You can disconnect your LinkedIn account at any time. You can request an export of your data, including your voice profile and writing samples, by emailing hello@zyntask.in. You can request deletion of your account and all associated data at any time, and we will confirm once it's done.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Cookies</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                We use only the minimum cookies needed to keep you signed in securely. We do not use advertising or cross-site tracking cookies.
              </p>
            </div>

            <div className="bg-cloud border border-line rounded-[20px] p-6">
              <p className="text-[13.5px] text-slate leading-relaxed">
                This policy is written in plain language by the Zyntask founder to be honest and specific, not to be exhaustive legal boilerplate. If anything here is unclear or you have concerns about a specific use of your data, email hello@zyntask.in directly.
              </p>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
