"use client";

// Sentinel shell - the command palette (Ctrl+K or Cmd+K). Jump to any page of the open project, switch project, start a
// new one, or change the display unit, from the keyboard. Same combobox pattern a screen reader expects: the
// input owns focus, the highlighted option is announced through aria-activedescendant.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setDisplayUnit } from "../displayUnit";
import { setSelectedWorkspace } from "../useSelectedWorkspace";
import { T } from "../theme";
import { buildCommands, filterCommands, projectSwitchTarget, type Command } from "./nav";
import { useShell } from "./ShellData";

export function CommandPalette({ currentId, open, onClose }: { currentId: string | null; open: boolean; onClose: () => void }) {
  const { workspaces, userId } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  const commands = useMemo(() => buildCommands(workspaces, userId, currentId), [workspaces, userId, currentId]);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    } else if (opener.current instanceof HTMLElement) {
      opener.current.focus();
    }
  }, [open]);

  function run(c: Command) {
    onClose();
    if ("href" in c.run) router.push(c.run.href);
    else if ("displayUnit" in c.run) setDisplayUnit(c.run.displayUnit);
    else if ("project" in c.run) {
      // The same rule as the top-bar switcher: on a project's own page, move to the same page of the other project.
      const target = projectSwitchTarget(pathname, c.run.project);
      setSelectedWorkspace(c.run.project, { url: !target });
      if (target) router.push(target);
    }
  }

  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.35)", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && results[active]) { e.preventDefault(); run(results[active]); }
        }}
        style={{ width: "min(560px, 92vw)", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 4, boxShadow: "0 16px 48px rgba(0,0,0,0.25)", overflow: "hidden" }}
      >
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="sn-palette-list"
          aria-activedescendant={results[active] ? `sn-cmd-${results[active].id}` : undefined}
          aria-label="Type a command or a project name"
          placeholder="Type a command or search..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${T.rule}`, padding: "0.9rem 1rem", fontFamily: "inherit", fontSize: "0.95rem", outline: "none", background: T.card, color: T.ink }}
        />
        <ul id="sn-palette-list" role="listbox" aria-label="Commands" style={{ listStyle: "none", margin: 0, padding: "0.3rem 0", maxHeight: "50vh", overflowY: "auto" }}>
          {results.length === 0 && <li style={{ padding: "0.8rem 1rem", color: T.inkSoft, fontSize: "0.85rem" }}>Nothing matches &quot;{query}&quot;.</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`sn-cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
              style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.55rem 1rem", cursor: "pointer", fontSize: "0.88rem", background: i === active ? T.accentSoft : "transparent", color: T.ink }}
            >
              <span>{c.label}</span>
              <span style={{ color: T.inkSoft, fontSize: "0.74rem" }}>{c.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
