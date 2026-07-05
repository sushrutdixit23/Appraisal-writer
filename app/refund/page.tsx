import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy - Zyntask",
  description: "How trials, cancellations, and refunds work at Zyntask.",
};

export default function RefundPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-6">Legal</p>
          <h1 className="font-display font-bold text-[clamp(34px,5vw,52px)] tracking-tight leading-[1.05] text-ink mb-4">Refund & Cancellation</h1>
          <p className="text-slate text-[14px] mb-14">Last updated July 2026.</p>

          <div className="space-y-10">

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Free trial</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                New accounts get a free trial period before any payment is required. You can cancel during the trial at no cost, with nothing charged.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Cancellation</h2>
              <p className="text-[16px] text-slate leading-relaxed">
                You can cancel your subscription at any time from your account settings or by emailing hello@zyntask.in. Cancellation stops future billing; you keep access through the end of your current billing period.
              </p>
            </div>

            <div>
              <h2 className="font-display font-bold text-[20px] text-ink mb-3">Refunds</h2>
              <p className="text-[16px] text-slate leading-relaxed mb-3">
                [Placeholder - confirm actual policy] If you are charged and have not used the service meaningfully (no replies or posts sent) within 48 hours of that charge, email hello@zyntask.in for a full refund.
              </p>
              <p className="text-[16px] text-slate leading-relaxed">
                [Placeholder - confirm actual policy] Beyond that window, subscription charges are non-refundable, but you can cancel at any time to stop future charges.
              </p>
            </div>

            <div className="bg-cloud border border-line rounded-[20px] p-6">
              <p className="text-[13.5px] text-slate leading-relaxed">
                Refund questions are handled personally, not by a bot or a ticket queue. Email hello@zyntask.in and expect a real reply.
              </p>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
