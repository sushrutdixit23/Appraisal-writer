export const dynamic = "force-dynamic";
import SiteNav from "../components/SiteNav";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-mist overflow-x-hidden">
      <SiteNav />
      <div className="max-w-4xl mx-auto px-6 pt-32 pb-20 text-center">
        <span className="inline-flex items-center gap-2 bg-cloud border border-line px-4 py-1.5 rounded-full text-ink-soft font-mono text-[11.5px] tracking-wide uppercase mb-7">
          Welcome to Zyntask
        </span>
        <h1 className="font-display font-bold tracking-tight text-[clamp(36px,5vw,58px)] mb-5 text-ink leading-tight">
          What would you like<br />to automate?
        </h1>
        <p className="text-slate text-lg max-w-[44ch] mx-auto mb-14 leading-relaxed">
          Each agent handles one thing â€” quietly, in the background, always with your approval.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
          <a href="/onboard" className="bg-ink text-white rounded-[24px] p-8 hover:-translate-y-1 hover:shadow-zy-lg transition-all group">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-5 text-xl">ðŸ’¬</div>
            <h2 className="font-display font-semibold text-[22px] tracking-tight mb-2">Engage</h2>
            <p className="text-[14.5px] text-white/70 leading-relaxed mb-5">
              Watches your LinkedIn comments and DMs, drafts replies in your voice, and waits for your yes before sending anything.
            </p>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white font-serif font-semibold text-xl">â‚¹49,000</span>
                <span className="text-white/50 text-sm ml-1">setup</span>
                <span className="text-white/50 text-sm ml-2">+ â‚¹7,500/mo</span>
              </div>
              <span className="text-white/60 group-hover:text-white transition-colors text-sm">Get started â†’</span>
            </div>
          </a>

          <a href="/appraisal-writer" className="bg-cloud border border-line rounded-[24px] p-8 hover:-translate-y-1 hover:shadow-zy-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-mist flex items-center justify-center mb-5 text-xl">ðŸ“</div>
            <h2 className="font-display font-semibold text-[22px] tracking-tight mb-2 text-ink">Appraisal Writer</h2>
            <p className="text-[14.5px] text-slate leading-relaxed mb-5">
              Converts your raw work notes into polished self-appraisal bullets and summaries â€” ready for your performance review form.
            </p>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-ink font-serif font-semibold text-xl">â‚¹149</span>
                <span className="text-slate text-sm ml-1">one-time</span>
              </div>
              <span className="text-slate group-hover:text-indigo transition-colors text-sm">Try it â†’</span>
            </div>
          </a>
        </div>

        <p className="text-slate text-sm mt-10">
          More agents coming. <a href="mailto:hello@zyntask.in" className="text-indigo hover:underline">Tell us what to build next â†’</a>
        </p>
      </div>
    </main>
  );
}
