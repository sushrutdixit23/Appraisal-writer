"use client";

import SiteNav from "../components/SiteNav";

const ACCENT = "linear-gradient(115deg,#5B4BFF,#8a6ff0)";

type Agent = {
  name: string;
  description: string;
  href: string;
  badge: string;
  badgeColor: string;
};

const AGENTS: Agent[] = [
  {
    name: "Engage",
    description: "Supervised, approval-gated LinkedIn outbound. Drafts replies, comments, and posts in your voice - nothing sends without your explicit sign-off.",
    href: "/engage",
    badge: "Paid",
    badgeColor: "#5B4BFF",
  },
  {
    name: "Appraisal Writer",
    description: "Turn a few rough notes about your work into a polished, ready-to-submit self-appraisal - achievements, summary, and growth reflections.",
    href: "/appraisal-writer",
    badge: "Free",
    badgeColor: "#1a9c6b",
  },
  {
    name: "ATS Resume Checker",
    description: "Get a scored, detailed breakdown of how your resume will actually parse and rank in real ATS systems - formatting issues, missing sections, weak phrasing, all flagged.",
    href: "/ats-checker",
    badge: "Free",
    badgeColor: "#1a9c6b",
  },
  {
    name: "AI Resume Optimizer",
    description: "Paste or upload your resume and Claude rewrites it end to end - stronger phrasing, cleaner structure, ATS-optimized. You review and refine the result.",
    href: "/resume-builder",
    badge: "Free",
    badgeColor: "#1a9c6b",
  },
  {
    name: "Resume Builder",
    description: "Build a resume field by field with full control over every word, or import an existing one to pre-fill everything exactly as written.",
    href: "/resume-form-builder",
    badge: "Free",
    badgeColor: "#1a9c6b",
  },
];

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-mist relative overflow-x-hidden">
      <div className="aurora-field" />
      <div className="relative z-10">
        <SiteNav />
        <div className="max-w-4xl mx-auto px-6 pt-24 pb-20">

          <div className="mb-12 text-center">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-indigo mb-2">All agents</p>
            <h1 className="font-display font-bold text-[32px] tracking-tight text-ink mb-3">Every Zyntask agent, in one place</h1>
            <p className="text-slate text-[15px] max-w-[52ch] mx-auto leading-relaxed">Pick the one that matches what you need right now - most are free to use.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {AGENTS.map((agent) => (
              
              <a
                key={agent.href}
                href={agent.href}
                className="block bg-cloud border border-line rounded-[20px] p-7 hover:border-indigo/40 hover:-translate-y-0.5 transition-all shadow-zy-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-[19px] text-ink">{agent.name}</h2>
                  <span
                    className="px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white flex-shrink-0"
                    style={{ background: agent.badgeColor }}
                  >
                    {agent.badge}
                  </span>
                </div>
                <p className="text-slate text-[14px] leading-relaxed mb-4">{agent.description}</p>
                <span className="text-[13.5px] font-semibold text-indigo">Try it &rarr;</span>
              </a>
            ))}
          </div>

        </div>
      </div>
    </main>
  );
}
