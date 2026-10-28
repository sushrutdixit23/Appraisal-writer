// Sentinel - is a flag a sector story or a company story? The narrative's second turn exists to answer
// exactly that ("confirms sector-wide effect" / "rules it out"), but left to the model it is a judgement
// from a handful of peer numbers. Counting how many companies actually raised the same flag in the same
// period is arithmetic, so the code does it and hands the model the result as a fact to reason from.
//
// A peer_outlier flag is excluded by definition: it says "this company differs from its peers", so it
// cannot also be a sector-wide pattern.

import type { AnomalyFlag, PeerRow } from "./types";

export type SectorReading = "sector_wide" | "company_specific" | "mixed" | "inconclusive";

export type SectorPattern = {
  flag_type: AnomalyFlag["flag_type"];
  metric: string;
  /** Companies (the subject included) that raised this flag type on this metric in this period. */
  raised_by: number;
  /** Companies with this period on file - the denominator. */
  of: number;
  /** Peers (not the subject) that raised the same flag, by name. */
  peers_raising: string[];
  reading: SectorReading;
};

/** Fewer than three companies with the period on file cannot separate "everyone" from "just us". */
export const MIN_COMPANIES_FOR_A_READING = 3;

export function readingFor(raisedBy: number, of: number): SectorReading {
  if (of < MIN_COMPANIES_FOR_A_READING) return "inconclusive";
  if (raisedBy >= 3 && raisedBy / of >= 0.5) return "sector_wide";
  if (raisedBy <= 1) return "company_specific";
  return "mixed";
}

export function sectorPatterns(allFlags: AnomalyFlag[], peerRows: PeerRow[], subjectWorkspaceId: string, period: string): SectorPattern[] {
  const of = new Set(peerRows.filter((r) => r.period_label === period).map((r) => r.workspace_id)).size;
  const mine = allFlags.filter((f) => f.workspace_id === subjectWorkspaceId && f.period_label === period && f.flag_type !== "peer_outlier");
  const seen = new Set<string>();
  const out: SectorPattern[] = [];
  for (const flag of mine) {
    const key = `${flag.flag_type}|${flag.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const same = allFlags.filter((f) => f.period_label === period && f.flag_type === flag.flag_type && f.metric === flag.metric);
    const companies = new Map(same.map((f) => [f.workspace_id, f.company_name]));
    out.push({
      flag_type: flag.flag_type,
      metric: flag.metric,
      raised_by: companies.size,
      of,
      peers_raising: [...companies].filter(([id]) => id !== subjectWorkspaceId).map(([, name]) => name),
      reading: readingFor(companies.size, of),
    });
  }
  return out;
}

const READING_TEXT: Record<SectorReading, string> = {
  sector_wide: "a SECTOR-WIDE pattern, not specific to this company",
  company_specific: "COMPANY-SPECIFIC: no peer raised it",
  mixed: "MIXED: some peers raised it, not enough to call it sector-wide",
  inconclusive: "INCONCLUSIVE: too few peers with this period on file to tell",
};

/** The counts as plain sentences for the prompt. Empty string when there is nothing to say. */
export function renderSectorPatterns(patterns: SectorPattern[], period: string): string {
  if (patterns.length === 0) return "";
  const lines = patterns.map((p) => {
    const who = p.peers_raising.length > 0 ? ` (peers raising it: ${p.peers_raising.join(", ")})` : "";
    return `- ${p.metric} (${p.flag_type}): raised by ${p.raised_by} of ${p.of} companies with ${period} on file${who} - ${READING_TEXT[p.reading]}.`;
  });
  return (
    `\n\nCounted from the flags themselves, not estimated (use these as fact when deciding whether this is a sector-wide effect):\n` +
    lines.join("\n")
  );
}
