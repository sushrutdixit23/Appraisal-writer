import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "FAQ - Zyntask",
  description: "Real answers to the questions people actually ask before connecting their LinkedIn account.",
};

const faqs = [
  {
    q: "Will this get my LinkedIn account restricted or banned?",
    a: "Engage applies a daily send cap that is always on, specifically to keep your activity inside what LinkedIn treats as normal usage. Nothing is ever sent automatically, so there is no risk of a burst of spam-like activity going out while you are not looking. The approval step exists for exactly this reason.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "You can request full deletion of your account and all associated data at any time by emailing hello@zyntask.in, and we will confirm once it is done. You do not need to ask for this before cancelling; cancelling and deleting are separate requests, so your data stays available if you want to come back.",
  },
  {
    q: "Can I export my voice profile?",
    a: "Yes. Email hello@zyntask.in and we will send you your voice profile and writing samples. This is your data, shaped from your own writing, and it stays yours.",
  },
  {
    q: "What if a draft doesn't sound like me?",
    a: "Edit it or skip it, and tell us why with a quick tag (wrong tone, too salesy, and so on). Both signals feed back into future drafts. The system is built to get sharper the more you correct it, not to assume it is right from day one.",
  },
  {
    q: "Does anything ever get sent without my approval?",
    a: "No. This is not a setting you can turn off. Every reply, comment, and post requires a deliberate click from you before it goes anywhere. If you never click approve, nothing ever sends.",
  },
  {
    q: "I manage multiple LinkedIn profiles for clients. Can Engage handle that?",
    a: "Today, each Engage account is built around one connected LinkedIn profile. If you manage several profiles for an agency or on behalf of clients, email hello@zyntask.in and we will help you set up a workable arrangement.",
  },
  {
    q: "How is this different from other LinkedIn automation tools?",
    a: "Most tools optimize for autonomy: sending on your behalf with minimal oversight. Engage is built the opposite way. Approval is architecture, not a toggle. Voice is learned from your own real edits and sent messages, not a generic template. Every classification comes with visible reasoning, not a black-box score.",
  },
  {
    q: "What if I want a refund?",
    a: "See our Refund and Cancellation Policy for the specifics. Refund questions are handled personally by email at hello@zyntask.in, not through a ticket queue.",
  },
];

export default function FaqPage() {
  return (
    <main className="relative min-h-screen bg-mist overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">

          <p className="font-mono text-[11.5px] tracking-[0.22em] uppercase text-indigo mb-6">Questions</p>
          <h1 className="font-display font-bold text-[clamp(34px,5vw,52px)] tracking-tight leading-[1.05] text-ink mb-4">Frequently asked.</h1>
          <p className="text-slate text-[16px] mb-14 max-w-[46ch]">The questions people actually ask before connecting their LinkedIn account, answered plainly.</p>

          <div className="space-y-8">
            {faqs.map((item) => (
              <div key={item.q} className="border-b border-line pb-8 last:border-0">
                <h2 className="font-display font-semibold text-[18px] text-ink mb-2.5">{item.q}</h2>
                <p className="text-[15.5px] text-slate leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="bg-cloud border border-line rounded-[20px] p-6 mt-14">
            <p className="text-[13.5px] text-slate leading-relaxed">
              Question not covered here? Email hello@zyntask.in and you will get a real reply from the founder, not an automated response.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
