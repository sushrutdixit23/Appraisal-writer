import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Terms of Service - Zyntask",
  description: "The terms governing use of Zyntask and Engage.",
};

export default function TermsPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-6">Legal</p>
          <h1 className="font-display font-bold text-[clamp(34px,5vw,52px)] tracking-tight leading-[1.05] text-ink mb-4">Terms of Service</h1>
          <p className="text-slate text-[14px] mb-14">Last updated July 2026. By using Zyntask, you agree to these terms.</p>

          <div className="space-y-10">

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">What Zyntask does</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                Zyntask provides Engage, a tool that drafts LinkedIn replies and posts in your voice. Every draft requires your explicit approval before it is sent, posted, or published. Nothing is ever sent automatically or without your review. This is not a setting you can disable; it is how the product is built.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Your account and your LinkedIn</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                You must connect a LinkedIn account that belongs to you and is in good standing. You are responsible for everything sent from your account, since every send requires your approval.
              </p>
              <p className="text-[16px] text-slate leading-relaxed">
                Zyntask applies a daily send cap to protect your account's standing on LinkedIn. This cap exists for your protection and is not adjustable beyond what keeps your account inside normal usage patterns.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Subscriptions and billing</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                New accounts start with a free trial. After the trial period, continued use requires an active paid subscription, billed through Razorpay. See our Refund and Cancellation Policy for billing-specific terms.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Acceptable use</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                You agree to use Zyntask in compliance with LinkedIn's own terms of service. You will not use Zyntask to send spam, harassment, or content that violates LinkedIn's policies. Zyntask reserves the right to suspend accounts that put shared infrastructure or other users at risk.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">No guarantee of outcomes</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                Zyntask helps you respond faster and more consistently. It does not guarantee specific business outcomes, leads, or results. AI-drafted content can make mistakes, which is exactly why every draft requires your review before anything is sent.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Ownership</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                You own everything you send or publish through Zyntask. Your writing samples and voice profile belong to you and can be exported or deleted at any time.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Termination</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                You can cancel your account at any time. We may suspend or terminate accounts that violate these terms or LinkedIn's own policies. On termination, your data is handled per our Privacy Policy.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Limitation of liability</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                Zyntask is provided as-is. We are not liable for indirect damages, lost business, or actions taken by LinkedIn against your account, including suspension or restriction, though our daily caps and approval-first design exist specifically to minimize that risk.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Governing law</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                These terms are governed by the laws of India.
              </p>
            </div>

            <div className="bg-cloud border border-line rounded-[20px] p-6">
              <p className="text-[13.5px] text-slate leading-relaxed">
                Questions about these terms can be sent to hello@zyntask.in.
              </p>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
