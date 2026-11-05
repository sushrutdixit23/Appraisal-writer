// Sentinel evaluation - the outside-review sample. Precision of the findings can only be measured by someone who is not the author, marking items against the PDF.
// Marking all 254 is more than a volunteer will do, so this draws a reproducible stratified sample (every reader is represented, in proportion), picks a subset for
// a second reviewer to mark independently, and measures how far the two agree. A published precision figure should come with that agreement figure: two people who
// disagree about what "right" means make the headline number meaningless.
//
// Everything is seeded, so anyone can redraw the same sample from the same sheet.

import { wilson } from "./scoring";

export type SheetLine = { cells: string[] };
export type Sheet = { header: string[]; rows: string[][] };

/** A small, fast, seedable generator (mulberry32): the same seed gives the same sequence on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A CSV with quoted fields and doubled quotes. The sheets Sentinel writes keep every row on one line, but a checker's spreadsheet program may re-quote them. */
export function parseCsv(text: string): Sheet {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return { header: rows[0] ?? [], rows: rows.slice(1) };
}

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const writeCsv = (s: Sheet): string => [s.header, ...s.rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";

/** An item's identity across two reviewers' sheets: the file, reader, page and what it says. The row order may differ after a spreadsheet re-sorts. */
export const itemKey = (header: string[], row: string[]): string => {
  const at = (name: string) => row[header.findIndex((h) => h.toLowerCase().startsWith(name))] ?? "";
  return [at("file"), at("reader"), at("page"), at("what"), at("values")].join("|");
};

export type Allocation = Record<string, number>;

/** How many of `n` go to each stratum: in proportion to its size, at least `min` each (or all of it, if smaller), by largest remainder, never more than the stratum holds. */
export function allocate(sizes: Record<string, number>, n: number, min = 5): Allocation {
  const keys = Object.keys(sizes);
  const total = keys.reduce((t, k) => t + sizes[k], 0);
  const target = Math.min(n, total);
  const out: Allocation = {};
  for (const k of keys) out[k] = Math.min(sizes[k], min);
  let used = keys.reduce((t, k) => t + out[k], 0);
  // Proportional top-up of what is left, by largest remainder, respecting each stratum's capacity.
  while (used < target) {
    const room = keys.filter((k) => out[k] < sizes[k]);
    if (room.length === 0) break;
    const weight = room.reduce((t, k) => t + sizes[k], 0);
    const want = room.map((k) => ({ k, share: ((target - used) * sizes[k]) / weight }));
    let gave = 0;
    for (const w of want) { const add = Math.min(Math.floor(w.share), sizes[w.k] - out[w.k]); out[w.k] += add; gave += add; }
    used += gave;
    if (used >= target) break;
    const rest = want.map((w) => ({ ...w, frac: w.share - Math.floor(w.share) })).sort((x, y) => y.frac - x.frac);
    let i = 0;
    while (used < target && i < rest.length) { const k = rest[i++].k; if (out[k] < sizes[k]) { out[k]++; used++; } }
    if (gave === 0 && i >= rest.length) break;
  }
  return out;
}

export type Sample = { sheet: Sheet; overlap: Sheet; perReader: Record<string, { available: number; sampled: number }>; seed: number };

/** `n` rows drawn at random within each reader (the "reader" column), in the sheet's own order; and `overlap` of them, drawn at random, for a second reviewer. */
export function drawSample(sheet: Sheet, n = 100, overlap = 30, seed = 20261105, min = 5): Sample {
  const rc = sheet.header.findIndex((h) => h.toLowerCase() === "reader");
  if (rc < 0) throw new Error("The sheet has no 'reader' column.");
  const byReader = new Map<string, number[]>();
  sheet.rows.forEach((r, i) => byReader.set(r[rc], [...(byReader.get(r[rc]) ?? []), i]));
  const sizes = Object.fromEntries([...byReader].map(([k, v]) => [k, v.length]));
  const alloc = allocate(sizes, n, min);
  const rand = rng(seed);
  const chosen: number[] = [];
  for (const k of Object.keys(sizes).sort()) chosen.push(...shuffle(byReader.get(k)!, rand).slice(0, alloc[k]));
  const picked = [...new Set(chosen)].sort((a, b) => a - b);
  const sampleRows = picked.map((i) => sheet.rows[i]);
  const second = shuffle(sampleRows.map((_, i) => i), rng(seed + 1)).slice(0, Math.min(overlap, sampleRows.length)).sort((a, b) => a - b).map((i) => sampleRows[i]);
  const perReader = Object.fromEntries(Object.keys(sizes).sort().map((k) => [k, { available: sizes[k], sampled: alloc[k] }]));
  return { sheet: { header: sheet.header, rows: sampleRows }, overlap: { header: sheet.header, rows: second }, perReader, seed };
}

export type Verdict = "right" | "wrong" | "partly";
export const asVerdict = (v: string | undefined): Verdict | null => {
  const t = (v ?? "").trim().toLowerCase();
  return t === "right" || t === "wrong" || t === "partly" ? t : null;
};

export type Agreement = { n: number; agree: number; rate: number | null; kappa: number | null; interval: [number, number] | null; disagreements: { key: string; a: Verdict; b: Verdict }[] };

/** How often two reviewers gave the same verdict on the items both marked, and Cohen's kappa: agreement beyond what chance alone would give. Kappa is null when chance
 * agreement is already total (everyone said the same thing), where it is undefined. */
export function agreement(a: Sheet, b: Sheet): Agreement {
  const vcA = a.header.findIndex((h) => h.toLowerCase().startsWith("verdict"));
  const vcB = b.header.findIndex((h) => h.toLowerCase().startsWith("verdict"));
  if (vcA < 0 || vcB < 0) throw new Error("A sheet has no verdict column.");
  const theirs = new Map(b.rows.map((r) => [itemKey(b.header, r), asVerdict(r[vcB])]));
  const pairs: { key: string; a: Verdict; b: Verdict }[] = [];
  for (const r of a.rows) {
    const key = itemKey(a.header, r);
    const va = asVerdict(r[vcA]), vb = theirs.get(key) ?? null;
    if (va && vb) pairs.push({ key, a: va, b: vb });
  }
  const n = pairs.length;
  if (n === 0) return { n: 0, agree: 0, rate: null, kappa: null, interval: null, disagreements: [] };
  const agree = pairs.filter((p) => p.a === p.b).length;
  const cats: Verdict[] = ["right", "wrong", "partly"];
  const pe = cats.reduce((t, c) => t + (pairs.filter((p) => p.a === c).length / n) * (pairs.filter((p) => p.b === c).length / n), 0);
  const po = agree / n;
  return { n, agree, rate: po, kappa: pe >= 1 ? null : (po - pe) / (1 - pe), interval: wilson(agree, n), disagreements: pairs.filter((p) => p.a !== p.b) };
}
