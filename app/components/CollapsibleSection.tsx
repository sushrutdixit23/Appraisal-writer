"use client";

import { useState, ReactNode } from "react";

export default function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-cloud border border-line rounded-[20px] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-6 text-left">
        <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-slate">{title}</p>
        <svg className={`w-4 h-4 stroke-slate stroke-[2] fill-none transition-transform flex-shrink-0 ml-3 ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5L10 12.5L15 7.5" /></svg>
      </button>
      {open && (
        <div className="px-6 pb-6 -mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
