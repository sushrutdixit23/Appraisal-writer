"use client";

// Sentinel - the shell. A company is a project, and everything hangs off the project you are in:
//
//   top bar   Projects / <project switcher> / <page>            Ctrl+K            Display: As reported | Crore | Lakh | Million
//   sidebar   All projects, + New project, then THE PROJECT'S nav (Overview, Data, Analysis, Settings)
//
// The choice of project is shared (see useSelectedWorkspace): the switcher, the palette, every page's own picker
// and every link move together. The side nav only offers a project's write pages (Add, Import, Edit) when the
// signed-in person owns it - reference companies are read-only.
//
// Scoped to /sentinel/* only. See docs/sentinel-ux.md for the reasoning.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./lib/shell/CommandPalette";
import { DisplayUnitControl } from "./lib/shell/DisplayUnitControl";
import { isActive, projectNav } from "./lib/shell/nav";
import { ProjectSwitcher } from "./lib/shell/ProjectSwitcher";
import { ShellProvider, useShell } from "./lib/shell/ShellData";
import { SANS, SERIF, T } from "./lib/theme";
import { unitLabel } from "./lib/units";
import { setSelectedWorkspace, useSelectedWorkspace } from "./lib/useSelectedWorkspace";

const PORTFOLIO_PATHS = ["/sentinel/projects", "/sentinel/new-project", "/sentinel/executive", "/sentinel/home"];
const UUID_IN_PATH = /^\/sentinel\/projects\/([0-9a-f-]{36})(?:\/|$)/i;

const PORTFOLIO_LABELS: Record<string, string> = {
  "/sentinel/projects": "All projects",
  "/sentinel/home": "All projects",
  "/sentinel/new-project": "New project",
  "/sentinel/executive": "Executive dashboard",
};

const GLOBAL_CSS = `
  @import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap");
  .sn-root a:focus-visible, .sn-root button:focus-visible, .sn-root select:focus-visible, .sn-root input:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
  .sn-nav a { transition: background 120ms ease, color 120ms ease; }
  .sn-nav a:hover { background: rgba(237,231,220,0.08); color: ${T.sidebarText}; }
  .sn-unit-btn:hover { background: ${T.accentSoft}; }
  .sn-switcher:hover, .sn-palette-btn:hover { background: ${T.accentSoft}; }
  .sn-skip { position: absolute; left: -9999px; top: 0; background: ${T.ink}; color: ${T.background}; padding: 0.6rem 1rem; z-index: 100; }
  .sn-skip:focus { left: 0; }
  @media (prefers-reduced-motion: reduce) { .sn-nav a { transition: none; } }
`;

export default function SentinelLayout({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion "user": animations that move things are skipped for anyone whose system asks for less motion.
    <MotionConfig reducedMotion="user">
      <ShellProvider>
        <Shell>{children}</Shell>
      </ShellProvider>
    </MotionConfig>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspaces, userId, loading } = useShell();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const ids = useMemo(() => workspaces.map((w) => w.id), [workspaces]);
  const [selected] = useSelectedWorkspace(ids);

  // A page under /sentinel/projects/<id> names its project in the address; that wins.
  const routeId = UUID_IN_PATH.exec(pathname)?.[1] ?? null;
  useEffect(() => {
    if (routeId && ids.includes(routeId)) setSelectedWorkspace(routeId, { url: false });
  }, [routeId, ids]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const portfolio = PORTFOLIO_PATHS.includes(pathname);
  const projectId = portfolio ? "" : routeId && ids.includes(routeId) ? routeId : selected;
  const project = workspaces.find((w) => w.id === projectId) ?? null;
  const canWrite = !!project && project.owner_id === userId;
  const nav = project ? projectNav(project.id, canWrite) : [];

  const pageLabel = portfolio
    ? PORTFOLIO_LABELS[pathname]
    : nav.flatMap((g) => g.items).find((i) => isActive(pathname, i.href, i.exact))?.label ?? "";

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: "block",
    textDecoration: "none",
    fontSize: "0.86rem",
    fontWeight: active ? 600 : 400,
    color: active ? T.sidebarText : T.sidebarTextMuted,
    padding: "0.5rem 0.7rem",
    background: active ? "rgba(164,117,81,0.22)" : "transparent",
    borderLeft: active ? `2px solid ${T.accent}` : "2px solid transparent",
  });
  const groupLabel: React.CSSProperties = {
    fontSize: "0.62rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: T.sidebarTextMuted, margin: "1rem 0 0.35rem 0.7rem",
  };

  return (
    <div className="sn-root" style={{ display: "flex", minHeight: "100vh", background: T.background, fontFamily: SANS, color: T.ink }}>
      <style>{GLOBAL_CSS}</style>
      <a href="#sentinel-main" className="sn-skip">Skip to content</a>

      <aside aria-label="Sentinel navigation" style={{ width: 232, flexShrink: 0, background: T.sidebar, padding: "1.4rem 1.1rem", display: "flex", flexDirection: "column" }}>
        <div style={{ paddingBottom: "0.9rem", borderBottom: "1px solid rgba(237,231,220,0.16)", marginBottom: "0.9rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <p style={{ fontSize: "0.62rem", fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: T.sidebarTextMuted, margin: "0 0 0.15rem 0" }}>Zyntask</p>
          </Link>
          <Link href="/sentinel/projects" style={{ textDecoration: "none" }}>
            <p style={{ fontFamily: SERIF, fontSize: "1.35rem", fontWeight: 500, color: T.sidebarText, margin: 0 }}>Sentinel</p>
          </Link>
        </div>

        <Link
          href="/sentinel/new-project"
          style={{ display: "block", textAlign: "center", textDecoration: "none", fontSize: "0.82rem", fontWeight: 600, color: T.sidebar, background: T.accent, padding: "0.55rem 0.7rem", borderRadius: 3, marginBottom: "0.7rem" }}
        >
          + New project
        </Link>

        <nav aria-label="Projects" className="sn-nav">
          <Link href="/sentinel/projects" style={linkStyle(pathname === "/sentinel/projects" || pathname === "/sentinel/home")} aria-current={pathname === "/sentinel/projects" ? "page" : undefined}>
            All projects
          </Link>
        </nav>

        {project && (
          <>
            <div style={{ margin: "1.1rem 0 0.2rem 0", padding: "0.7rem 0.7rem 0.6rem", borderTop: "1px solid rgba(237,231,220,0.16)" }} data-testid="project-block">
              <p style={{ fontFamily: SERIF, fontSize: "1.02rem", fontWeight: 500, color: T.sidebarText, margin: "0 0 0.25rem 0", lineHeight: 1.25 }}>{project.company_name}</p>
              <p style={{ fontSize: "0.7rem", color: T.sidebarTextMuted, margin: 0, lineHeight: 1.5 }}>
                {canWrite ? "Your project" : "Reference company, read-only"}
                <br />
                {project.sector} - {unitLabel(project.currency_unit)} - {project.comparison_basis}
              </p>
            </div>
            <nav aria-label={`${project.company_name} pages`} className="sn-nav">
              {nav.map((group, gi) => (
                <div key={gi}>
                  {group.label && <p style={groupLabel}>{group.label}</p>}
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href, item.exact);
                    return (
                      <Link key={item.label} href={item.href} style={linkStyle(active)} aria-current={active ? "page" : undefined}>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </>
        )}

        {!project && !loading && workspaces.length === 0 && (
          <p style={{ fontSize: "0.78rem", color: T.sidebarTextMuted, margin: "1.2rem 0.7rem", lineHeight: 1.5 }}>No projects yet. Create one to start.</p>
        )}

        <nav aria-label="Portfolio" className="sn-nav" style={{ marginTop: "0.4rem" }}>
          <p style={groupLabel}>Portfolio</p>
          <Link href="/sentinel/executive" style={linkStyle(pathname === "/sentinel/executive")} aria-current={pathname === "/sentinel/executive" ? "page" : undefined}>
            Executive dashboard
          </Link>
        </nav>

        <p style={{ marginTop: "auto", paddingTop: "1.2rem", fontSize: "0.68rem", lineHeight: 1.5, color: T.sidebarTextMuted }}>
          AI-drafted, human-approved.
          <br />
          Nothing is final without sign-off.
        </p>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "0.6rem 2.8rem", background: T.background, borderBottom: `1px solid ${T.rule}` }}
        >
          <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.55rem", fontSize: "0.85rem", minWidth: 0 }}>
            <Link href="/sentinel/projects" style={{ color: T.inkSoft, textDecoration: "none" }}>Projects</Link>
            {!portfolio && (
              <>
                <span aria-hidden="true" style={{ color: T.rule }}>/</span>
                <ProjectSwitcher currentId={projectId} />
              </>
            )}
            {pageLabel && (
              <>
                <span aria-hidden="true" style={{ color: T.rule }}>/</span>
                <span aria-current="page" style={{ color: T.ink, fontWeight: 600 }}>{pageLabel}</span>
              </>
            )}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
            <button
              type="button"
              className="sn-palette-btn"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              aria-keyshortcuts="Control+K Meta+K"
              style={{ fontFamily: "inherit", fontSize: "0.78rem", color: T.inkSoft, background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "0.32rem 0.7rem", cursor: "pointer" }}
            >
              Search or run a command <kbd style={{ fontFamily: "inherit", border: `1px solid ${T.rule}`, borderRadius: 3, padding: "0 0.3rem", marginLeft: 6 }}>Ctrl K</kbd>
            </button>
            <DisplayUnitControl />
          </div>
        </header>

        <main id="sentinel-main" tabIndex={-1} style={{ flex: 1, display: "flex", justifyContent: "center", padding: "2rem 2.8rem" }}>
          <div style={{ width: "100%", maxWidth: 1080 }}>{children}</div>
        </main>
      </div>

      <CommandPalette currentId={project ? project.id : null} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
