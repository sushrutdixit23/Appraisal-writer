// Sentinel shell - the navigation model, the command list and the setup checklist. Pure, so each has a test.

import { findPriorYear } from "../engine";
import { DISPLAY_UNITS, type DisplayUnit } from "../displayUnitCore";
import type { FinancialStatement, Workspace } from "../types";

export type NavItem = { href: string; label: string; exact?: boolean };
export type NavGroup = { label: string | null; items: NavItem[] };

/** The side nav for one project. Read-only companies (the reference set) get the pages that only read. */
export function projectNav(projectId: string, canWrite: boolean): NavGroup[] {
  const w = `?workspace=${projectId}`;
  const groups: NavGroup[] = [
    { label: null, items: [{ href: `/sentinel/projects/${projectId}`, label: "Overview", exact: true }] },
    {
      label: "Data",
      items: [
        { href: `/sentinel/statements${w}`, label: "Statements" },
        ...(canWrite
          ? [
              { href: `/sentinel/projects/${projectId}/import`, label: "Import files" },
              { href: `/sentinel/add-period${w}`, label: "Edit periods" },
            ]
          : []),
      ],
    },
    {
      label: "Analysis",
      items: [
        { href: `/sentinel/kpi${w}`, label: "KPIs" },
        { href: `/sentinel/analysis${w}`, label: "Peers and trends" },
        { href: `/sentinel/results${w}`, label: "Results brief" },
        ...(canWrite ? [{ href: `/sentinel/covenants${w}`, label: "Covenants" }] : []),
        { href: `/sentinel${w}`, label: "Investigations", exact: true },
        { href: `/sentinel/reviews${w}`, label: "Reviews" },
      ],
    },
    { label: null, items: [{ href: `/sentinel/projects/${projectId}/settings`, label: "Settings" }] },
  ];
  return groups;
}

/** Where "switch to project <id>" goes from `pathname`. A page under a project's own address moves to the same
 * sub-page of the other project (Settings stays Settings); any other page stays where it is and only the shared
 * selection changes, which returns null. */
export function projectSwitchTarget(pathname: string, id: string): string | null {
  const m = /^\/sentinel\/projects\/[^/]+(\/.*)?$/.exec(pathname);
  return m ? `/sentinel/projects/${id}${m[1] ?? ""}` : null;
}

/** Is a nav link the current page? Query strings are ignored; the bare /sentinel root matches only itself. */
export function isActive(pathname: string, href: string, exact = false): boolean {
  const path = href.split("?")[0];
  if (exact || path === "/sentinel") return pathname === path;
  return pathname === path || pathname.startsWith(path + "/");
}

export type Command = {
  id: string;
  label: string;
  hint: string;
  group: string;
  /** Extra words that find the command but are not shown: the other ways people spell it. */
  keywords?: string;
  run: { href: string } | { displayUnit: DisplayUnit } | { project: string };
};

// How people write each unit: Indian filings and CAs say lakh, lac, lacs, lakhs; crore is cr or crores; and so on.
const UNIT_KEYWORDS: Record<DisplayUnit, string> = {
  as_reported: "original own native unit",
  INR_CRORE: "cr crores",
  INR_LAKH: "lac lacs lakhs",
  INR_MILLION: "mn mm millions",
};

export function buildCommands(workspaces: Pick<Workspace, "id" | "company_name" | "owner_id" | "is_public_reference">[], userId: string, current: string | null): Command[] {
  const out: Command[] = [
    { id: "go-projects", label: "All projects", hint: "Go to", group: "Go to", run: { href: "/sentinel/projects" } },
    { id: "new-project", label: "New project", hint: "Create a company", group: "Actions", run: { href: "/sentinel/new-project" } },
    { id: "go-exec", label: "Executive dashboard", hint: "Go to", group: "Go to", run: { href: "/sentinel/executive" } },
    { id: "go-digest", label: "Coverage digest", hint: "Go to", group: "Go to", keywords: "today attention todo morning", run: { href: "/sentinel/digest" } },
    { id: "go-calendar", label: "Results calendar", hint: "Go to", group: "Go to", keywords: "results due deadline quarter earnings season", run: { href: "/sentinel/calendar" } },
    { id: "go-calibration", label: "Confidence calibration", hint: "Go to", group: "Go to", keywords: "accuracy trust score", run: { href: "/sentinel/calibration" } },
  ];
  if (current) {
    const ws = workspaces.find((w) => w.id === current);
    const canWrite = !!ws && ws.owner_id === userId;
    for (const g of projectNav(current, canWrite)) {
      for (const item of g.items) {
        out.push({ id: `go-${item.label}`, label: item.label, hint: ws ? `Go to, ${ws.company_name}` : "Go to", group: "Go to", run: { href: item.href } });
      }
    }
  }
  for (const w of workspaces) {
    out.push({
      id: `switch-${w.id}`,
      label: `Switch to ${w.company_name}`,
      hint: w.owner_id === userId ? "Your project" : "Reference company",
      group: "Projects",
      run: { project: w.id },
    });
  }
  for (const u of DISPLAY_UNITS) {
    out.push({
      id: `unit-${u.value}`,
      label: u.value === "as_reported" ? "Show figures as reported" : `Show figures in ${u.label.replace("₹ ", "").toLowerCase()}`,
      hint: "Display unit",
      group: "Display",
      keywords: UNIT_KEYWORDS[u.value],
      run: { displayUnit: u.value },
    });
  }
  return out;
}

// When two commands match equally, the display unit beats the rest: "lakh" is far more often the unit than a
// project that happens to have lakh in its name (a project is still one more word away: "lakh ind").
const GROUP_RANK: Record<string, number> = { Display: 0, "Go to": 1, Actions: 1, Projects: 2 };

/** Rank commands for a typed query: every word must appear; label-start and whole-word matches rank higher. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  const scored: { c: Command; score: number; order: number }[] = [];
  commands.forEach((c, order) => {
    const hay = `${c.label} ${c.hint} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return;
    const label = c.label.toLowerCase();
    const keys = (c.keywords ?? "").toLowerCase().split(/\s+/);
    let score = 0;
    for (const w of words) {
      if (label.startsWith(w)) score += 3;
      else if (label.split(/\s+/).some((t) => t.startsWith(w))) score += 2;
      else if (label.includes(w)) score += 1;
      else if (keys.includes(w)) score += 2; // a spelling of it, matched whole
    }
    scored.push({ c, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || (GROUP_RANK[a.c.group] ?? 3) - (GROUP_RANK[b.c.group] ?? 3) || a.order - b.order)
    .map((s) => s.c);
}

// ---- setup checklist --------------------------------------------------------------------------------------

export type SetupStep = { id: string; title: string; detail: string; done: boolean; href: string | null; cta: string | null };

const BALANCE_FIELDS = ["total_assets", "current_assets", "total_equity", "total_debt"] as const;

export function setupChecklist(input: {
  projectId: string;
  statements: FinancialStatement[];
  investigations: { status: string }[];
}): SetupStep[] {
  const { projectId, statements, investigations } = input;
  const annual = statements.filter((s) => s.period_type === "FY");
  const hasBalance = annual.some((s) => BALANCE_FIELDS.some((f) => s[f] != null));
  const hasCash = annual.some((s) => s.cash_from_operations != null);
  const latest = [...annual].sort((a, b) => b.period_end_date.localeCompare(a.period_end_date))[0];
  const hasPrior = !!latest && findPriorYear(latest, statements) != null;
  const w = `?workspace=${projectId}`;
  return [
    {
      id: "first-year", title: "Add the first annual statement", done: annual.length > 0,
      detail: "Revenue, profit before tax and profit after tax are enough to start. Upload a filing or a spreadsheet, or type the figures.",
      href: `/sentinel/projects/${projectId}/import`, cta: "Import a file",
    },
    {
      id: "balance-sheet", title: "Add the balance sheet", done: hasBalance,
      detail: "Unlocks the liquidity, leverage and working-capital checks.",
      href: `/sentinel/add-period${w}`, cta: "Edit the period",
    },
    {
      id: "cash-flow", title: "Add cash flow", done: hasCash,
      detail: "Unlocks the cash-flow health check (operating cash flow against profit).",
      href: `/sentinel/add-period${w}`, cta: "Edit the period",
    },
    {
      id: "prior-year", title: "Add the previous year", done: hasPrior,
      detail: "Growth rates and the year-on-year flags need a like-for-like prior year (same basis).",
      href: `/sentinel/projects/${projectId}/import`, cta: "Import a file",
    },
    {
      id: "first-investigation", title: "Generate your first investigation", done: investigations.length > 0,
      detail: "Where a figure moves past its threshold, Sentinel drafts an explanation for you to review.",
      href: `/sentinel${w}`, cta: "Open investigations",
    },
    {
      id: "first-approval", title: "Approve a finding", done: investigations.some((i) => i.status === "approved" || i.status === "edited"),
      detail: "Nothing is final until a person approves it. Approved findings appear on the executive dashboard.",
      href: `/sentinel${w}`, cta: "Review",
    },
  ];
}
