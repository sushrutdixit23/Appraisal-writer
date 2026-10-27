"use client";

// Sentinel shell - the project switcher in the top bar: the company you are in, and a searchable list of the
// rest. Choosing one moves every page with you (the choice is shared; see useSelectedWorkspace).

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { workspaceOptionLabel } from "../access";
import { setSelectedWorkspace } from "../useSelectedWorkspace";
import { T } from "../theme";
import { projectSwitchTarget } from "./nav";
import { useShell } from "./ShellData";

export function ProjectSwitcher({ currentId }: { currentId: string }) {
  const { workspaces, userId } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = workspaces.find((w) => w.id === currentId);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspaces.filter((w) => !q || w.company_name.toLowerCase().includes(q) || (w.sector ?? "").toLowerCase().includes(q));
  }, [workspaces, query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    setQuery("");
    // On a page that lives under the project's own address, carry the same sub-page to the new project.
    const target = projectSwitchTarget(pathname, id);
    setSelectedWorkspace(id, { url: !target });
    if (target) router.push(target);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter" && shown[active]) { e.preventDefault(); choose(shown[active].id); }
  }

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Project: ${current?.company_name ?? "none selected"}. Switch project`}
        onClick={() => { setOpen((o) => !o); setActive(0); }}
        className="sn-switcher"
        style={{ fontFamily: "inherit", fontSize: "0.86rem", fontWeight: 600, color: T.ink, background: "transparent", border: `1px solid ${T.rule}`, borderRadius: 3, padding: "0.3rem 0.7rem", cursor: "pointer", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {current?.company_name ?? "Select a project"} <span aria-hidden="true" style={{ color: T.inkSoft }}>&#9662;</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Switch project"
          onKeyDown={onKey}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: 320, background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 40 }}
        >
          <input
            ref={search}
            aria-label="Search projects"
            placeholder="Find a project"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${T.rule}`, padding: "0.65rem 0.8rem", fontFamily: "inherit", fontSize: "0.85rem", outline: "none", background: T.card, color: T.ink }}
          />
          <ul role="listbox" aria-label="Projects" style={{ listStyle: "none", margin: 0, padding: "0.25rem 0", maxHeight: 280, overflowY: "auto" }}>
            {shown.length === 0 && <li style={{ padding: "0.6rem 0.8rem", fontSize: "0.82rem", color: T.inkSoft }}>No project matches.</li>}
            {shown.map((w, i) => (
              <li
                key={w.id}
                role="option"
                aria-selected={w.id === currentId}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(w.id)}
                style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", background: i === active ? T.accentSoft : "transparent", color: T.ink, fontWeight: w.id === currentId ? 600 : 400 }}
              >
                {workspaceOptionLabel(w, userId)}
                <span style={{ color: T.inkSoft, fontSize: "0.72rem", marginLeft: 8 }}>{w.sector}</span>
              </li>
            ))}
          </ul>
          <div style={{ borderTop: `1px solid ${T.rule}`, display: "flex", justifyContent: "space-between", padding: "0.5rem 0.8rem", fontSize: "0.8rem" }}>
            <a href="/sentinel/projects" style={{ color: T.ink }}>All projects</a>
            <a href="/sentinel/new-project" style={{ color: T.accent, fontWeight: 600 }}>+ New project</a>
          </div>
        </div>
      )}
    </div>
  );
}
