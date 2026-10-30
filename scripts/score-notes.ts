// The accuracy scorecard for what Sentinel reads out of annual reports. Anyone with the same PDFs gets the same numbers.
//
//   npm run score:notes -- <folder of annual-report PDFs> [--out <folder>] [--truth <truth.json>] [--basis standalone|consolidated]
//
// It writes, into --out (default ./scorecard-out):
//   scorecard.md   coverage of each reader on each report, tie-outs against the report's own figures, statement figures against typed ground truth,
//                  and every finding raised
//   items.csv      every extracted item with its page and the text it came from and an EMPTY verdict column - the sheet an outside checker marks
//   precision.md   (written by `--marked items.csv` instead of a folder) precision per reader from a marked sheet, with a 95% interval
//
// truth.json: { "<pdf file name without .pdf>": { "basis": "standalone", "period": "FY26", "fields": { "revenue_from_operations": 220938, ... } } }
//
// What it is not: a claim of accuracy. The tie-outs and the typed figures cover the few reports they cover; the checker's sheet is the real test.

import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { autofillFromPdfPages } from "../app/sentinel/lib/autofill/pdf";
import { ageingFindings, readReceivablesAgeing, summariseTable } from "../app/sentinel/lib/autofill/notes/ageing";
import { readCaro } from "../app/sentinel/lib/autofill/notes/caro";
import { readContingentLiabilities } from "../app/sentinel/lib/autofill/notes/contingent";
import { readAnnualNotes, NOTE_KINDS, NOTE_LABEL } from "../app/sentinel/lib/autofill/notes";
import { readMaturities } from "../app/sentinel/lib/autofill/notes/maturity";
import { readReportedRatios } from "../app/sentinel/lib/autofill/notes/ratios";
import { readRelatedParties } from "../app/sentinel/lib/autofill/notes/relatedParty";
import { compareFields, precisionFromSheet, summariseComparison, tieOutAgeing, toCsv, type SheetRow } from "../app/sentinel/lib/evaluation/notesScorecard";
import type { PdfPage } from "../app/sentinel/lib/autofill/../extraction";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const pct = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(0)}%`);

async function readPages(file: string): Promise<PdfPage[]> {
  const parser = new PDFParse({ data: fs.readFileSync(file) });
  try { return (await parser.getText()).pages.map((p) => ({ num: p.num, text: p.text })); } finally { await parser.destroy(); }
}

async function main() {
  const marked = flag("marked");
  if (marked) {
    const p = precisionFromSheet(fs.readFileSync(marked, "utf8"));
    const lines = ["# Precision from the checker's marked sheet", "", "| Reader | Right | Partly | Wrong | Unmarked | Precision (right of marked) | 95% interval |", "|---|---|---|---|---|---|---|"];
    for (const [k, v] of Object.entries(p)) lines.push(`| ${k} | ${v.right} | ${v.partly} | ${v.wrong} | ${v.unmarked} | ${pct(v.precision)} | ${v.interval ? `${pct(v.interval[0])} - ${pct(v.interval[1])}` : "n/a"} |`);
    console.log(lines.join("\n"));
    return;
  }
  const dir = args.find((a) => !a.startsWith("--") && fs.existsSync(a) && fs.statSync(a).isDirectory());
  if (!dir) { console.error("Usage: npm run score:notes -- <folder of PDFs> [--out dir] [--truth truth.json] [--basis standalone|consolidated]  |  --marked items.csv"); process.exit(2); }
  const out = flag("out") ?? "scorecard-out";
  fs.mkdirSync(out, { recursive: true });
  const truth = flag("truth") ? (JSON.parse(fs.readFileSync(flag("truth")!, "utf8")) as Record<string, { basis?: "standalone" | "consolidated"; period: string; fields: Record<string, number> }>) : {};
  const sheet: SheetRow[] = [];
  const md: string[] = ["# Sentinel notes reader - scorecard", "", `Run on ${new Date().toISOString().slice(0, 10)} over the PDFs in \`${dir}\`. Not a claim of accuracy: see the end of this file.`, ""];
  const coverage: string[][] = [];
  const tie: string[] = [];
  const figs: string[] = [];
  const findingsMd: string[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
    const name = file.replace(/\.pdf$/i, "");
    const t0 = Date.now();
    const pages = await readPages(path.join(dir, file));
    const t1 = Date.now();
    const t = truth[name];
    const basis = (flag("basis") as "standalone" | "consolidated" | undefined) ?? t?.basis ?? "consolidated";
    let result: ReturnType<typeof autofillFromPdfPages> | null = null, statementError = "";
    try { result = autofillFromPdfPages(pages, { preferredBasis: basis }); } catch (e) { statementError = (e as Error).message; }
    const notes = readAnnualNotes(pages);
    const t2 = Date.now();

    coverage.push([name, String(pages.length), ...NOTE_KINDS.map((k) => String(notes.read[k])), String(notes.findings.filter((f) => f.severity === "high").length), String(notes.findings.filter((f) => f.severity === "medium").length), `${((t2 - t1) / 1000).toFixed(1)}s`]);

    // ---- sheet rows
    const ageing = readReceivablesAgeing(pages);
    for (const a of ageing) { const s = summariseTable(a); sheet.push({ file: name, reader: "ageing", page: a.page, what: `receivables ageing table (year ${a.year_hint ?? "?"})`, values: `gross ${a.total[a.total.length - 1]}; allowance ${a.allowance ?? "-"}; over 1y ${s?.over_1y != null ? pct(s.over_1y) : "-"}; ${a.rows.length} rows, ${a.rows_rejected} rejected`, source: a.excerpt }); }
    for (const r of readReportedRatios(pages)) sheet.push({ file: name, reader: "ratios", page: r.page, what: r.label, values: `${r.current} (last year ${r.previous}; printed variance ${r.printed_variance ?? "-"} ${r.variance_kind ?? ""}; ${r.basis ?? "basis unknown"})`, source: r.source });
    for (const c of readCaro(pages)) for (const cl of c.clauses) sheet.push({ file: name, reader: "caro", page: cl.page, what: `clause (${cl.id}) ${cl.title} [${c.scope}]`, values: cl.status, source: cl.excerpt });
    for (const i of readContingentLiabilities(pages)) sheet.push({ file: name, reader: "contingent", page: i.page, what: `${i.kind}: ${i.subject ?? ""}`, values: `${i.current}${i.prior != null ? ` / ${i.prior}` : ""} ${i.unit ?? ""}`, source: i.text });
    for (const m of readMaturities(pages)) for (const r of m.rows.filter((x) => x.kind !== "other")) sheet.push({ file: name, reader: "maturity", page: m.page, what: `${r.kind}: ${r.label} (year ${m.year_hint ?? "?"})`, values: `${JSON.stringify(r.buckets)} total ${r.total} ${m.unit ?? ""}`, source: r.text });
    for (const t of readRelatedParties(pages)) for (const r of t.rows.filter((x) => x.kind !== "other")) sheet.push({ file: name, reader: "related_parties", page: t.page, what: `${r.kind}: ${r.label} (year ${t.year_hint ?? "?"})`, values: `${JSON.stringify(r.columns)} total ${r.total}`, source: r.text });
    for (const f of notes.findings) sheet.push({ file: name, reader: "finding", page: f.page, what: `[${f.severity}] ${f.title}`, values: f.id, source: f.detail });

    // ---- tie-outs
    const tos = ageing.map((a) => tieOutAgeing(a, pages.find((p) => p.num === a.page)));
    const tied = tos.filter((x) => x.status === "tied").length, no = tos.filter((x) => x.status === "no_match").length, nt = tos.filter((x) => x.status === "not_testable").length;
    tie.push(`| ${name} | ${ageing.length} | ${tied} | ${no} | ${nt} | ${tos.filter((x) => x.status === "no_match").map((x) => `p${x.page}`).join(", ") || "-"} |`);
    const caro = readCaro(pages).filter((c) => c.clauses_found.length > 1);
    const clauses = caro.length ? `${caro[0].clauses_found.length} clauses (${caro[0].scope})` : "annexure not found";

    // ---- statement figures against typed truth
    if (t && result) {
      const p = result.periods.find((x) => x.period_label === t.period && (x.basis === basis || x.basis == null));
      const got = Object.fromEntries(Object.keys(t.fields).map((k) => [k, (p?.fields as Record<string, { value: number } | undefined>)?.[k]?.value ?? null]));
      const cmp = compareFields(t.fields, got);
      const s = summariseComparison(cmp);
      figs.push(`| ${name} | ${t.period} ${basis} | ${s.n} | ${s.match} | ${s.wrong} | ${s.missing} | ${pct(s.n ? s.match / s.n : null)} (${s.interval ? `${pct(s.interval[0])}-${pct(s.interval[1])}` : "n/a"}) | ${cmp.filter((c) => c.status === "wrong").map((c) => `${c.field}: got ${c.got}, typed ${c.expected}`).slice(0, 6).join("; ") || "-"} |`);
    } else if (t && !result) figs.push(`| ${name} | ${t.period} ${basis} | ${Object.keys(t.fields).length} | 0 | 0 | ${Object.keys(t.fields).length} | 0% | the statement reader failed: ${statementError.slice(0, 120)} |`);

    findingsMd.push(`### ${name} (${clauses})`, "");
    const shown = notes.findings.filter((f) => f.severity !== "info");
    findingsMd.push(shown.length ? shown.map((f) => `- **${f.severity}** [${NOTE_LABEL[f.note]}] p.${f.page}: ${f.title}`).join("\n") : "- nothing at high or medium", "", `- statement reader: ${result ? `${result.periods.length} period(s) read in ${((t1 - t0) / 1000).toFixed(1)}s load + ${((t2 - t1) / 1000).toFixed(1)}s read` : `failed (${statementError.slice(0, 100)})`}`, "");
  }

  md.push("## What each reader found, per report", "", "A zero means the reader did not recognise that note in that report. It is not a statement that the note is clean.", "",
    `| Report | Pages | ${NOTE_KINDS.map((k) => NOTE_LABEL[k]).join(" | ")} | High | Medium | Time |`, `|---|---|${NOTE_KINDS.map(() => "---").join("|")}|---|---|---|`, ...coverage.map((r) => `| ${r.join(" | ")} |`), "",
    "## Tie-outs: receivables gross less allowance against the net figure printed on the page", "", "| Report | Tables | Tied | No match | Not testable | No-match pages |", "|---|---|---|---|---|---|", ...tie, "",
    "No match is not proof of an error (a report may print its net on another page); it is the list to look at first.", "");
  if (figs.length) md.push("## Statement figures against figures typed from the filing", "", "| Report | Period | Fields | Match | Wrong | Missing | Match rate (95% interval) | Wrong values |", "|---|---|---|---|---|---|---|---|", ...figs, "", "A missing figure is a gap; a wrong one is a danger. Both are counted against the reader.", "");
  md.push("## Findings raised (high and medium)", "", ...findingsMd, "## What this scorecard does not show", "",
    "- Precision of the findings. That needs a person to look at `items.csv` against the PDF and fill the verdict column; then run `npm run score:notes -- --marked items.csv`.",
    "- Recall. Nobody has listed every receivables table, CARO answer or contingent liability in these reports, so what was missed is unknown.",
    "- Anything about reports that were not in the folder. The author chose these; a different set will give different numbers.", "");
  fs.writeFileSync(path.join(out, "scorecard.md"), md.join("\n"));
  fs.writeFileSync(path.join(out, "items.csv"), toCsv(sheet));
  console.log(`Wrote ${path.join(out, "scorecard.md")} and ${path.join(out, "items.csv")} (${sheet.length} items to check).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
