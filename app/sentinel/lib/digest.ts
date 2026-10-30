// Sentinel - the coverage digest: what needs an analyst's attention today, in one ranked list, instead of a
// tool they have to remember to open and hunt through. Pure: it takes what the pages already load and returns
// sections of items, each with a link to where the work is done. Only the caller's OWN companies are listed -
// reference companies are context for the checks, never an item on someone's to-do list.

import { groupFlagsByWorkspace, runAllChecks } from "./anomaly";
import { buildPeerTable } from "./engine";
import { buildResultsCalendar, describeRow } from "./resultsCalendar";
import { isOverdue, type RequestLike } from "./requestDates";
import type { AnomalyFlag, FinancialStatement, Investigation, Recommendation, Workspace } from "./types";

export type DigestItem = {
  workspace_id: string;
  company_name: string;
  title: string;
  detail: string;
  href: string;
};

export type DigestSection = { id: "filings" | "results" | "decide" | "discussion" | "investigate" | "recommendations" | "requests" | "data"; title: string; empty: string; items: DigestItem[] };

export type Digest = { sections: DigestSection[]; total: number };

export type DigestInput = {
  workspaces: Workspace[];
  statements: FinancialStatement[];
  investigations: Investigation[];
  recommendations: Recommendation[];
  requests?: (RequestLike & { workspace_id: string })[];
  /** New (not yet dismissed) results / annual-report filings found by the filing watcher. */
  filings?: { id: string; workspace_id: string; kind: "results" | "annual_report"; headline: string; filed_at: string; url: string | null }[];
  /** Reviewer comments the owner has not read yet, one row per investigation. */
  discussion?: { workspace_id: string; period_label: string; unread: number }[];
  userId: string;
  /** YYYY-MM-DD. */
  today: string;
};

/** A price older than this makes market cap, P/E and the EV multiples a statement about last month. */
export const PRICE_STALE_DAYS = 7;
/** A year's statements are expected within this many days of the year end (a listed company files within 60; a private one is slower). */
export const STATEMENTS_GRACE_DAYS = 120;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function buildDigest(input: DigestInput): Digest {
  const { workspaces, statements, investigations, recommendations, today, userId } = input;
  const own = new Map(workspaces.filter((w) => w.owner_id === userId).map((w) => [w.id, w]));
  const name = (id: string) => workspaces.find((w) => w.id === id)?.company_name ?? "Unknown company";

  // 0. Something new was filed: the highest-value item a push can carry, because the next step is to import it.
  const filings = (input.filings ?? [])
    .filter((f) => own.has(f.workspace_id))
    .sort((a, b) => b.filed_at.localeCompare(a.filed_at))
    .map<DigestItem>((f) => ({
      workspace_id: f.workspace_id,
      company_name: name(f.workspace_id),
      title: `${name(f.workspace_id)} - ${f.kind === "annual_report" ? "annual report" : "results"} filed ${f.filed_at.slice(0, 10)}`,
      detail: `${f.headline}${f.url ? ` Open on BSE: ${f.url}` : ""} Import the figures once you have the file.`,
      href: `/sentinel/projects/${f.workspace_id}/import`,
    }));

  // 0b. Results due this week, or past the statutory deadline with nothing imported (see resultsCalendar.ts).
  const results = buildResultsCalendar(workspaces, statements, today, userId)
    .filter((r) => r.status === "due_soon" || r.status === "overdue")
    .map<DigestItem>((r) => ({
      workspace_id: r.workspace_id,
      company_name: r.company_name,
      title: `${r.company_name} - ${r.period_label} results ${r.status === "overdue" ? "past the deadline" : "due this week"}`,
      detail: describeRow(r),
      href: `/sentinel/projects/${r.workspace_id}/import`,
    }));

  // 1. Drafts waiting for a decision, the most confident first.
  const decide = investigations
    .filter((i) => i.status === "pending" && own.has(i.workspace_id))
    .sort((a, b) => (b.confidence_score ?? -1) - (a.confidence_score ?? -1))
    .map<DigestItem>((i) => {
      const warnings = i.grounding_warnings?.length ?? 0;
      const first = i.observation?.[0]?.description;
      return {
        workspace_id: i.workspace_id,
        company_name: name(i.workspace_id),
        title: `${name(i.workspace_id)} - ${i.period_label}`,
        detail:
          `${i.confidence_score != null ? `Confidence ${i.confidence_score}%. ` : ""}${first ?? "Draft ready for review."}` +
          (warnings > 0 ? ` ${warnings} figure${warnings > 1 ? "s" : ""} in the narrative could not be traced to the data.` : ""),
        href: "/sentinel",
      };
    });

  // 1b. Someone commented on a shared investigation and the owner has not read it.
  const discussion = (input.discussion ?? [])
    .filter((d) => own.has(d.workspace_id) && d.unread > 0)
    .map<DigestItem>((d) => ({
      workspace_id: d.workspace_id,
      company_name: name(d.workspace_id),
      title: `${name(d.workspace_id)} - ${d.unread} new comment${d.unread > 1 ? "s" : ""} on ${d.period_label}`,
      detail: "A reviewer replied on the shared investigation.",
      href: "/sentinel",
    }));

  // 2. Flags nobody has investigated yet, the furthest past their threshold first.
  const bySector = new Map<string, Workspace[]>();
  for (const w of workspaces) bySector.set(w.sector, [...(bySector.get(w.sector) ?? []), w]);
  const flags: AnomalyFlag[] = [];
  for (const [sector, ws] of bySector) {
    flags.push(...runAllChecks(buildPeerTable(ws, statements, ws[0].id, "FY"), sector));
  }
  const investigated = new Set(investigations.map((i) => `${i.workspace_id}|${i.period_label}`));
  const investigate = groupFlagsByWorkspace(flags.filter((f) => own.has(f.workspace_id)))
    .filter((g) => !investigated.has(`${g[0].workspace_id}|${g[0].period_label}`))
    .map((g) => ({ g, severity: Math.max(...g.map((f) => f.severity)) }))
    .sort((a, b) => b.severity - a.severity)
    .map<DigestItem>(({ g }) => ({
      workspace_id: g[0].workspace_id,
      company_name: g[0].company_name,
      title: `${g[0].company_name} - ${g[0].period_label}: ${g.length} flag${g.length > 1 ? "s" : ""}`,
      detail: g[0].description,
      href: "/sentinel",
    }));

  // 3. Recommendations still waiting, highest priority first.
  const recs = recommendations
    .filter((r) => r.status === "pending" && own.has(r.workspace_id))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3))
    .map<DigestItem>((r) => ({
      workspace_id: r.workspace_id,
      company_name: name(r.workspace_id),
      title: `${r.priority}: ${r.title}`,
      detail: `${name(r.workspace_id)} - ${r.owner}, ${r.timeline}. ${r.business_value}`,
      href: "/sentinel/reviews",
    }));

  // 4. Data the company owes: requests past their due date.
  const requests = (input.requests ?? [])
    .filter((r) => own.has(r.workspace_id) && isOverdue(r, today))
    .map<DigestItem>((r) => ({
      workspace_id: r.workspace_id,
      company_name: name(r.workspace_id),
      title: `${name(r.workspace_id)} - figures for ${r.period_end_date} not received`,
      detail: `Due ${r.due_date ?? "15 days after the period end"}. The upload link is still open.`,
      href: `/sentinel/projects/${r.workspace_id}/import`,
    }));

  // 5. Stale or missing inputs.
  const data: DigestItem[] = [];
  for (const w of own.values()) {
    const annual = statements.filter((s) => s.workspace_id === w.id && s.period_type === "FY").sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
    const latest = annual[0];
    if (!latest) {
      data.push({ workspace_id: w.id, company_name: w.company_name, title: `${w.company_name} - no annual statements`, detail: "Nothing to analyse yet. Import a filing or a trial balance.", href: `/sentinel/projects/${w.id}/import` });
      continue;
    }
    const nextEnd = new Date(Date.parse(`${latest.period_end_date}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
    if (days(nextEnd, today) > STATEMENTS_GRACE_DAYS) {
      data.push({ workspace_id: w.id, company_name: w.company_name, title: `${w.company_name} - the year to ${nextEnd} is not on file`, detail: `The latest annual statement is ${latest.period_label}; the next one was due about ${days(nextEnd, today) - STATEMENTS_GRACE_DAYS} days ago.`, href: `/sentinel/projects/${w.id}/import` });
    }
    if (latest.shares_outstanding != null) {
      const asOf = w.market_price_as_of ?? null;
      if (w.market_price == null || !asOf) {
        data.push({ workspace_id: w.id, company_name: w.company_name, title: `${w.company_name} - no share price`, detail: "Shares outstanding are on file but there is no price, so market cap and the valuation multiples cannot be computed.", href: `/sentinel/projects/${w.id}/settings` });
      } else if (days(asOf, today) > PRICE_STALE_DAYS) {
        data.push({ workspace_id: w.id, company_name: w.company_name, title: `${w.company_name} - share price is ${days(asOf, today)} days old`, detail: `Last priced ${asOf}. Valuation multiples are using it.`, href: `/sentinel/projects/${w.id}/settings` });
      }
    }
  }

  const sections: DigestSection[] = [
    { id: "filings", title: "New filings", empty: "No new results or annual reports.", items: filings },
    { id: "results", title: "Results due", empty: "No results due this week.", items: results },
    { id: "decide", title: "Waiting for your decision", empty: "No drafts waiting.", items: decide },
    { id: "discussion", title: "Reviewer comments", empty: "No unread comments.", items: discussion },
    { id: "investigate", title: "Flagged, not yet investigated", empty: "Every flag has been investigated.", items: investigate },
    { id: "recommendations", title: "Recommendations to act on", empty: "No pending recommendations.", items: recs },
    { id: "requests", title: "Figures not received", empty: "No data requests are overdue.", items: requests },
    { id: "data", title: "Data that has gone stale", empty: "Statements and prices are current.", items: data },
  ];
  return { sections, total: sections.reduce((n, s) => n + s.items.length, 0) };
}
