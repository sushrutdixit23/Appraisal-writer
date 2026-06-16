"use client";

import { useState } from "react";

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/engage", label: "Engage" },
    { href: "/#agents", label: "Agents" },
    { href: "/appraisal-writer", label: "Appraisal Writer" },
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-mist/80 border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-[70px] flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 font-display font-bold text-xl text-ink">
          <span className="w-7.5 h-7.5 rounded-[9px] bg-grad flex items-center justify-center shadow-zy-sm">
            <svg viewBox="0 0 20 20" className="w-4 h-4 stroke-white stroke-[2.6] fill-none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5 8.5 15 16 5.5" />
            </svg>
          </span>
          Zyntask
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] text-ink-soft hover:text-indigo transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3.5">
          <a href="mailto:hello@zyntask.in" className="hidden md:inline-flex px-5 py-2.5 rounded-[11px] text-[15px] font-medium text-ink hover:text-indigo transition-colors">
            Talk to us
          </a>
          <a href="/engage" className="hidden md:inline-flex px-5 py-2.5 rounded-[11px] text-[15px] font-medium bg-ink text-white shadow-zy-sm hover:-translate-y-0.5 hover:shadow-zy-md transition-all">
            See Engage
          </a>

          <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} className="md:hidden flex flex-col gap-[5px] p-2">
            <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`w-[22px] h-[2px] bg-ink rounded-full transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      <div className={`md:hidden border-t border-line bg-mist overflow-hidden transition-all duration-300 ${open ? "max-h-[400px]" : "max-h-0"}`}>
        <div className="px-6 py-5 flex flex-col gap-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-3 text-[16px] text-ink-soft hover:text-indigo transition-colors border-b border-line-soft last:border-0">
              {l.label}
            </a>
          ))}
          <a href="mailto:hello@zyntask.in" onClick={() => setOpen(false)} className="mt-4 inline-flex justify-center px-5 py-3 rounded-[11px] text-[15px] font-medium text-ink border border-line">
            Talk to us
          </a>
          <a href="/engage" onClick={() => setOpen(false)} className="mt-2.5 inline-flex justify-center px-5 py-3 rounded-[11px] text-[15px] font-medium bg-ink text-white">
            See Engage
          </a>
        </div>
      </div>
    </nav>
  );
}