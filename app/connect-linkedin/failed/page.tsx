"use client";
export const dynamic = "force-dynamic";

const ACCENT = "linear-gradient(115deg,#0A66C2,#5B4BFF,#8a6ff0)";

export default function ConnectFailedPage() {
  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif font-semibold text-3xl text-white mb-3">Connection did not complete.</h1>
        <p className="text-slate-light text-[15px] leading-relaxed max-w-[38ch] mx-auto mb-9">
          Something interrupted the LinkedIn connection. No problem - you can try again.
        </p>
        <a
          href="/connect-linkedin"
          className="inline-flex px-7 py-3.5 rounded-[14px] text-[15px] font-semibold text-white transition-all hover:opacity-90"
          style={{ background: ACCENT }}
        >
          Try again
        </a>
      </div>
    </main>
  );
}
