// Sentinel autofill / notes - the auditor's answers under the Companies (Auditor's Report) Order, 2020 (CARO). Every Indian company's auditor answers a fixed set
// of questions: has the company defaulted on a loan, was any fraud noticed, are statutory dues in arrears, were cash losses incurred, is there doubt about meeting
// liabilities. The answer is normally a clean "no". The point of reading it is the year it is not, and nothing else in a set of financial statements says it so
// plainly. A reader skims an annexure of twenty-one clauses; this finds the few that matter and quotes them.
//
// How it finds them: the annexure is identified by what it says (its first clause is about property, plant and equipment, with "full particulars"), not by its
// letter, because the CARO statement is Annexure A in one report and Annexure B in the next. Clauses are split on their roman numerals in sequence. Each of the
// high-signal clauses is then matched against the standard clear wording and the standard adverse wording; wording it does not recognise is reported as "read it",
// never as clear. Every result carries its clause, its page and the auditor's own words.
//
// It does not read the tables inside a clause (the disputed statutory dues schedule, the list of loans granted), judge whether an adverse answer is material,
// or assess the clauses that are rarely adverse (valuation of PPE, benami property, struck-off companies, auditor resignation).

import type { PdfPage } from "../../extraction";
import type { NoteFinding } from "./ageing";

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi"];
const MAX_PAGES = 14;
const MAX_EXCERPT = 600;

export type ClauseStatus = "clear" | "adverse" | "read_it";
export type CaroClause = { id: string; title: string; status: ClauseStatus; page: number; excerpt: string };
export type CaroResult = {
  /** Scope of the annexure the clauses were read from. */
  scope: "standalone" | "consolidated" | "unknown";
  pages: number[];
  clauses_found: string[];
  clauses: CaroClause[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
/** Full stops that do not end a sentence ("Rs. 3.5 crore", "i.e.", "No. 5") are swapped for a look-alike while matching, so a sentence is never cut at one. */
const DOT = "\u2024";
const protect = (s: string) => s.replace(/(\d)\.(?=\d)/g, `$1${DOT}`).replace(/\b(Rs|Nos?|Ltd|Pvt|Co|viz|approx|i\.e|e\.g)\.(?=[\s,\d)])/gi, `$1${DOT}`).replace(/\bi\.e\./gi, `i${DOT}e${DOT}`);
const restore = (s: string) => s.split(DOT).join(".");
const cut = (s: string, n = MAX_EXCERPT) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n)).trim()} ...`);

/** A line that opens a clause: "(vii)" or "vii." at the start, followed by space or a tab. Only the next numeral in sequence counts, so "(i)" inside a clause is not one. */
const MARKER = /^\s*\(?([ivx]+)[.)]\s/;

type Block = { id: string; page: number; text: string };

function annexureStart(p: PdfPage): boolean {
  const lines = p.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER.exec(lines[i]);
    if (m?.[1] !== "i") continue;
    const window = lines.slice(i, i + 12).join(" ");
    if (/property,?\s+plant\s+and\s+equipment/i.test(window) && /full particulars|proper records|quantitative details/i.test(window)) return true;
  }
  return false;
}

function splitClauses(pages: PdfPage[]): Block[] {
  const out: Block[] = [];
  let next = 0;
  let cur: Block | null = null;
  for (const p of pages) {
    for (const line of p.text.split("\n")) {
      const m = MARKER.exec(line);
      if (m && next < ROMAN.length && m[1] === ROMAN[next]) {
        if (cur) out.push(cur);
        cur = { id: ROMAN[next], page: p.num, text: line };
        next++;
      } else if (cur) cur.text += `\n${line}`;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** The pages of every CARO annexure in a report: from the page that opens a clause (i) about property, plant and equipment, until the internal-financial-controls
 * annexure or fourteen pages. */
export function findCaroPages(pages: PdfPage[]): PdfPage[][] {
  const sorted = [...pages].sort((a, b) => a.num - b.num);
  const out: PdfPage[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (!annexureStart(sorted[i])) continue;
    const run: PdfPage[] = [];
    for (let j = i; j < Math.min(sorted.length, i + MAX_PAGES); j++) {
      if (j > i && sorted[j].num !== sorted[j - 1].num + 1) break; // a gap in the page numbers is the end of what we were given
      if (j > i && /report on the internal financial controls|internal financial controls (?:with reference|over financial reporting)/i.test(sorted[j].text.slice(0, 700))) break;
      run.push(sorted[j]);
    }
    out.push(run);
    i += run.length - 1;
  }
  return out;
}

// ---- the clauses that matter --------------------------------------------------------------------------------------------------

type Pattern = { re: RegExp; /** The pattern carries its own negation ("not regular in depositing"), so the usual "a no/not earlier in the sentence cancels it" test is skipped. */ direct?: boolean };
type Rule = {
  id: string;
  title: string;
  /** Standard wording of a clean answer. */
  clear: RegExp[];
  /** Standard wording of an adverse one: the thing worth reading first. */
  adverse: Pattern[];
  /** A sentence that matches this is the auditor explaining the answer away in the same breath, so it is not raised as adverse. */
  unless?: RegExp;
  severity: "high" | "medium";
};

const RULES: Rule[] = [
  {
    id: "i", title: "Title deeds of immovable property", severity: "medium",
    clear: [/title deeds[^.]{0,450}(?:are|is) held in the name of the (?:Company|Group)(?![^.]{0,200}\bexcept\b)/i, /not applicable|no immovable propert/i],
    adverse: [{ re: /(?:except for|other than)[^.]{0,260}not held in the name of the (?:Company|Group)/i, direct: true }, { re: /title deeds[^.]{0,200}not held in the name/i, direct: true }],
  },
  {
    id: "vii", title: "Statutory dues", severity: "high",
    clear: [/generally been regular in depositing|has been regular in depositing|regularly deposited/i],
    adverse: [{ re: /not\s+(?:been\s+)?(?:generally\s+)?regular in depositing/i, direct: true }, { re: /(?:were|was) in arrears|arrears of[^.]{0,80}(?:Rs|\u20b9|`)/i }, { re: /delays? in (?:deposit|payment)[^.]{0,60}statutory/i }],
  },
  {
    id: "ix", title: "Default on borrowings", severity: "high",
    clear: [/not defaulted|no default|did not default|not taken any (?:loans?|borrowings?)|did not have any loans|not obtained any|not applicable/i],
    adverse: [{ re: /\bdefault(?:ed|s)?\b[^.]{0,80}(?:repayment|loans?|borrowings?|interest)/i }, { re: /delay(?:s|ed)? in (?:the )?(?:repayment|payment)[^.]{0,80}(?:loans?|borrowings?|interest|principal)/i }, { re: /(?:has|have) been declared (?:a )?wilful defaulter/i, direct: true }],
  },
  {
    id: "xi", title: "Fraud", severity: "high",
    clear: [/no fraud[^.]{0,120}(?:noticed|reported)|nor any fraud/i],
    adverse: [{ re: /fraud[^.]{0,160}(?:noticed|reported)[^.]{0,160}(?:Rs|\u20b9|`|amount)/i }, { re: /fraud[^.]{0,200}(?:Rs|\u20b9|`|amounting)[^.]{0,160}(?:noticed|reported)/i }, { re: /(?:sub-?section\s*\(12\)\s*of\s*section\s*143|section\s*143\s*\(12\))[^.]{0,200}(?:has|have) been (?:filed|submitted|reported)/i }, { re: /report[^.]{0,60}(?:has|have) been filed[^.]{0,120}ADT-?4/i }],
  },
  {
    id: "xvii", title: "Cash losses", severity: "high",
    clear: [/not incurred (?:any )?cash losses?/i],
    adverse: [{ re: /incurred cash loss(?:es)?[^.]{0,60}(?:of|amounting|aggregating)/i }, { re: /cash loss(?:es)?[^.]{0,60}(?:Rs|\u20b9|`)\s*[\d,]+/i }],
  },
  {
    id: "xix", title: "Ability to meet liabilities within a year", severity: "high",
    // The standard clean answer itself contains the words "material uncertainty exists": it says nothing has come to the auditor's attention that would make them believe so.
    clear: [/nothing has come to our attention[^.]{0,300}material uncertainty|no material uncertainty/i],
    adverse: [{ re: /material uncertainty exists/i }],
  },
  {
    id: "xx", title: "Unspent CSR", severity: "medium",
    clear: [/(?:has|have) transferred|no unspent|no amount (?:remaining )?unspent|not applicable/i],
    adverse: [{ re: /has not transferred|not (?:been )?transferred[^.]{0,80}unspent|unspent[^.]{0,120}not (?:been )?transferred/i, direct: true }],
    // "...to a Special Account ... till the date of our report since the time period for such transfer, i.e., 30 days from the end of the financial year has not elapsed"
    unless: /not (?:yet )?elapsed|not lapsed|yet to (?:elapse|lapse)|time period for such transfer/i,
  },
  {
    id: "viii", title: "Unrecorded income", severity: "medium",
    clear: [/no such transactions|not applicable|there were no|has no transactions|not (?:surrendered|disclosed)/i],
    adverse: [{ re: /surrendered or disclosed[^.]{0,160}(?:Rs|\u20b9|`)\s*[\d,]+/i }, { re: /(?:Rs|\u20b9|`)\s*[\d,]+[^.]{0,120}(?:has|have) been surrendered or disclosed/i }],
  },
  {
    id: "ii", title: "Inventory and working-capital limits", severity: "medium",
    clear: [/no discrepancies|not applicable|agreement with the books|does not hold any physical|does not have any inventory/i],
    adverse: [{ re: /discrepancies[^.]{0,120}10%[^.]{0,80}(?:noticed|found)/i }, { re: /quarterly returns[^.]{0,200}(?:not in agreement|material discrepanc|differences)/i }],
  },
];

const NEGATION = /\b(?:no|not|nor|never|none|nothing|without|neither|nil)\b/i;

/** The first match of `re` in `text` that is not cancelled by a negation earlier in its own sentence ("no undisputed amounts ... were in arrears" is the clean
 * answer; "were in arrears" alone is not). Returns the index, or -1. */
function affirmedMatch(text: string, p: Pattern): number {
  const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (p.direct) return m.index;
    const sentenceStart = text.lastIndexOf(". ", m.index) + 1;
    if (!NEGATION.test(text.slice(sentenceStart, m.index))) return m.index;
    if (m[0].length === 0) re.lastIndex++;
  }
  return -1;
}

/** The wording around a match, for the excerpt: the auditor's own sentence and the one after it (a qualifier such as "However, this has not been considered ...
 * on the basis of materiality" is often the sentence that matters), trimmed to a readable size. */
const around = (text: string, at: number) => {
  const start = Math.max(0, text.lastIndexOf(". ", Math.max(0, at - 1)) + 1);
  const first = text.indexOf(". ", at);
  const second = first < 0 ? -1 : text.indexOf(". ", first + 2);
  const end = second < 0 ? text.length : second + 1;
  return cut(clean(text.slice(start, end)));
};

function assess(rule: Rule, b: Block): CaroClause {
  const flat = protect(clean(b.text));
  for (const p of rule.adverse) {
    const at = affirmedMatch(flat, p);
    if (at < 0) continue;
    const sentence = around(flat, at);
    if (rule.unless && rule.unless.test(sentence)) continue;
    return { id: rule.id, title: rule.title, status: "adverse", page: b.page, excerpt: restore(sentence) };
  }
  if (rule.clear.some((re) => re.test(flat))) return { id: rule.id, title: rule.title, status: "clear", page: b.page, excerpt: restore(cut(flat, 240)) };
  return { id: rule.id, title: rule.title, status: "read_it", page: b.page, excerpt: restore(cut(flat)) };
}

/** Subsidiary auditors' CARO answers, reported in clause (xxi) of a consolidated annexure: the holding company's auditor lists any group company whose own CARO
 * report carried a qualification or adverse remark. "did not include any unfavourable answers" is the clean form; a table of entities with CINs is the other. */
function consolidatedClause(b: Block): CaroClause {
  const flat = clean(b.text);
  const clean_ = /did not include any (?:unfavou?rable|qualifications?|adverse)|no (?:unfavou?rable|qualifications?|adverse)|not include any unfavou?rable/i.test(flat);
  if (clean_) return { id: "xxi", title: "Group companies' CARO answers", status: "clear", page: b.page, excerpt: cut(flat, 260) };
  if (/(?:have|has) unfavou?rable|qualification or adverse remarks|unfavou?rable or qualified/i.test(flat)) {
    // The entities named before "The above does not include": each with its CIN, its relationship, and the clause number the auditor called unfavourable.
    const afterHeading = flat.split(/Clause number of the CARO report which is unfavou?rable or qualified or adverse/i);
    const listed = (afterHeading[afterHeading.length - 1]).split(/The above does not include/i)[0];
    const rows = [...listed.matchAll(/([A-Z][\w&.,'() -]{3,80}?)\s+[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\s+((?:Holding Company|Subsidiary|Joint Venture|Associate)(?:\s*\/\s*[A-Za-z]+)*)\s+((?:Clause|clause)\s*\([a-z]+\)(?:\([a-z]\))?(?:\s*(?:and|,)\s*(?:Clause|clause)\s*\([a-z]+\)(?:\([a-z]\))?)*)/g)].map((m) => `${clean(m[1])} (${clean(m[2])}): ${clean(m[3])}`);
    return { id: "xxi", title: "Group companies' CARO answers", status: "adverse", page: b.page, excerpt: rows.length > 0 ? cut(rows.join("; ")) : cut(listed) };
  }
  return { id: "xxi", title: "Group companies' CARO answers", status: "read_it", page: b.page, excerpt: cut(flat) };
}

export function readCaro(pages: PdfPage[]): CaroResult[] {
  const out: CaroResult[] = [];
  for (const run of findCaroPages(pages)) {
    const blocks = splitClauses(run);
    if (blocks.length < 8) continue; // a handful of numerals is not an annexure
    const head = run[0].text.slice(0, 900);
    const scope = /consolidated/i.test(head) && !/standalone/i.test(head) ? "consolidated" : /standalone/i.test(head) ? "standalone" : "unknown";
    const clauses: CaroClause[] = [];
    for (const rule of RULES) {
      const b = blocks.find((x) => x.id === rule.id);
      if (b) clauses.push(assess(rule, b));
    }
    const x21 = blocks.find((x) => x.id === "xxi");
    if (x21) clauses.push(consolidatedClause(x21));
    out.push({ scope, pages: run.map((p) => p.num), clauses_found: blocks.map((b) => b.id), clauses });
  }
  // A consolidated annexure holds only clause (xxi): the page that opens with it, referring to the Holding Company and subsidiaries.
  for (const p of pages) {
    if (out.some((r) => r.pages.includes(p.num))) continue;
    const lines = p.text.split("\n");
    const i = lines.findIndex((l) => /^\s*\(?xxi[.)]\s/.test(l));
    if (i < 0 || !/holding company|subsidiar/i.test(p.text)) continue;
    if (!/annexure|auditor.s report order|CARO/i.test(p.text.slice(0, 900))) continue;
    out.push({ scope: "consolidated", pages: [p.num], clauses_found: ["xxi"], clauses: [consolidatedClause({ id: "xxi", page: p.num, text: lines.slice(i).join("\n") })] });
  }
  return out;
}

export function caroFindings(results: CaroResult[]): NoteFinding[] {
  const out: NoteFinding[] = [];
  for (const r of results) {
    for (const c of r.clauses) {
      if (c.status === "clear") continue;
      const rule = RULES.find((x) => x.id === c.id);
      const where = r.scope === "unknown" ? "" : ` (${r.scope})`;
      if (c.status === "adverse") {
        out.push({
          id: `caro_${c.id}`, severity: rule?.severity ?? "high", page: c.page,
          title: `The auditor's CARO answer on ${c.title.toLowerCase()} is not the clean one${where}`,
          detail: `Clause (${c.id}): "${c.excerpt}"`,
        });
      } else if (rule?.severity === "high") {
        out.push({
          id: `caro_${c.id}_read`, severity: "info", page: c.page,
          title: `CARO clause (${c.id}) on ${c.title.toLowerCase()}: wording not recognised${where}`,
          detail: `Sentinel could not match this answer to the standard clean or adverse form, so it is not marked clear. Read it: "${cut(c.excerpt, 360)}"`,
        });
      }
    }
  }
  return out;
}
