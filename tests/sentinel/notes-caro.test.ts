// The CARO reader, against the real FY26 annual reports of TCS, Infosys, Tech Mahindra, Wipro and HCLTech (the annexure pages are fixtures), and synthetic
// annexures for the adverse wordings a clean report does not show. The two things that matter: a clean answer is never raised (the first version raised the standard
// clean wording of five reports as adverse, because a clean answer contains words like "arrears" and "default" inside a "no"), and a real adverse answer is quoted
// with its page.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caroFindings, findCaroPages, readCaro } from "../../app/sentinel/lib/autofill/notes/caro";

const load = (co: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `caro-${co}.json`), "utf-8")) as { num: number; text: string }[];
const status = (co: string, id: string, scope = "standalone") => readCaro(load(co)).find((r) => r.scope === scope || (scope === "any"))?.clauses.find((c) => c.id === id);

test("TCS, Infosys, Wipro and HCLTech: every clause the reader assesses is clear, so nothing is raised (and the annexure is found whatever its letter)", () => {
  for (const co of ["tcs", "infosys", "wipro", "hcl"]) {
    const results = readCaro(load(co));
    const standalone = results.find((r) => r.clauses_found.length >= 20);
    assert.ok(standalone, `${co}: the CARO annexure was not found`);
    assert.equal(standalone!.clauses_found.length, 20, `${co}: clauses (i) to (xx)`);
    for (const r of results) for (const c of r.clauses) assert.equal(c.status, "clear", `${co} clause (${c.id}): ${c.excerpt}`);
    assert.deepEqual(caroFindings(results), [], co);
  }
});

test("the CARO statement is Annexure A in one report and Annexure B in the next, so it is found by what it says", () => {
  // Infosys and Wipro put it in Annexure B; TCS and Tech Mahindra in Annexure A. The first clause is about property, plant and equipment in all of them.
  for (const co of ["tcs", "infosys", "tml", "wipro", "hcl"]) assert.ok(findCaroPages(load(co)).length >= 1, co);
});

test("Tech Mahindra: three genuine findings, quoted with their pages - title deeds not in the company's name, a section 143(12) fraud report filed, and the group's own list", () => {
  const f = caroFindings(readCaro(load("tml")));
  assert.deepEqual(f.map((x) => [x.id, x.severity, x.page]), [["caro_i", "medium", 435], ["caro_xi", "high", 437], ["caro_xxi", "high", 551]]);
  assert.match(f[0].detail, /held in the name of the Company, except for properties \(including three leasehold properties\), included in Appendix 1, which are not held in the name of the Company/);
  // The qualifier that makes clause (a) "no fraud" misleading is kept in the excerpt.
  assert.match(f[1].detail, /report under sub-section \(12\) of section 143[^"]*has been filed by us in Form ADT-4[^"]*However, this has not been considered for our reporting in clause \(a\) above on the basis of materiality/);
  // Two independent readings agree: the consolidated annexure itself names clauses (i)(c) and (xi)(b) of the holding company's CARO as unfavourable.
  assert.match(f[2].detail, /Tech Mahindra Limited \(Holding Company\): Clause \(i\)\(c\) and Clause \(xi\)\(b\)/);
});

test("the clean answer 'no undisputed amounts ... were in arrears' is not adverse; 'were in arrears' on its own is", () => {
  const clean = status("tcs", "vii")!;
  assert.equal(clean.status, "clear");
  const bad = readCaro(annexure({ vii: "(vii) (a) According to our examination, undisputed statutory dues including Provident Fund and Income Tax of Rs 14 crore were in arrears as at 31 March 2026 for a period of more than six months from the date they became payable." }))[0].clauses.find((c) => c.id === "vii")!;
  assert.equal(bad.status, "adverse");
  assert.match(bad.excerpt, /were in arrears/);
});

// ---- synthetic annexures ---------------------------------------------------------------------------------------------------------

const CLEAN: Record<string, string> = {
  i: "(i) (a) (A) The Company has maintained proper records showing full particulars, including quantitative details and situation of Property, Plant and Equipment. (c) the title deeds of immovable properties disclosed in the financial statements are held in the name of the Company.",
  ii: "(ii) (a) The inventory has been physically verified by the management. No discrepancies were noticed on verification between the physical stocks and the book records that were more than 10% in the aggregate of each class of inventory.",
  iii: "(iii) The Company has not made investments or granted loans.",
  iv: "(iv) The Company has complied with sections 185 and 186.",
  v: "(v) The Company has not accepted any deposits.",
  vi: "(vi) Cost records are not applicable.",
  vii: "(vii) (a) The Company has generally been regular in depositing undisputed statutory dues with the appropriate authorities. There were no undisputed amounts payable in arrears as at 31 March 2026 for more than six months.",
  viii: "(viii) There were no transactions relating to previously unrecorded income that were surrendered or disclosed as income in the tax assessments.",
  ix: "(ix) (a) The Company has not defaulted in repayment of loans or borrowings or in the payment of interest thereon to any lender. (b) The Company has not been declared a wilful defaulter.",
  x: "(x) The Company has not raised money by way of initial public offer.",
  xi: "(xi) (a) No fraud by the Company or on the Company has been noticed or reported during the year. (b) No report under sub-section (12) of section 143 of the Companies Act has been filed by the auditors.",
  xii: "(xii) The Company is not a Nidhi Company.",
  xiii: "(xiii) Transactions with related parties are in compliance with sections 177 and 188.",
  xiv: "(xiv) The Company has an internal audit system.",
  xv: "(xv) The Company has not entered into non-cash transactions with directors.",
  xvi: "(xvi) The Company is not required to be registered under section 45-IA of the RBI Act.",
  xvii: "(xvii) The Company has not incurred cash losses in the current and the immediately preceding financial year.",
  xviii: "(xviii) There has been no resignation of the statutory auditors.",
  xix: "(xix) On the basis of the financial ratios, ageing and expected dates of realisation of financial assets and payment of financial liabilities, nothing has come to our attention, which causes us to believe that any material uncertainty exists as on the date of the audit report that the Company is not capable of meeting its liabilities.",
  xx: "(xx) (a) There is no unspent amount under sub-section (5) of section 135 of the Act that requires transfer. (b) The Company has transferred the unspent amount to a Special Account within 30 days.",
};
const annexure = (over: Record<string, string> = {}) => [
  { num: 1, text: `Annexure A to the Independent Auditor's Report\n${Object.entries({ ...CLEAN, ...over }).map(([, v]) => v).join("\n")}` },
];
const clause = (over: Record<string, string>, id: string) => readCaro(annexure(over))[0].clauses.find((c) => c.id === id)!;

test("a fully clean synthetic annexure raises nothing", () => {
  const r = readCaro(annexure());
  assert.equal(r[0].clauses_found.length, 20);
  assert.ok(r[0].clauses.every((c) => c.status === "clear"), JSON.stringify(r[0].clauses.filter((c) => c.status !== "clear")));
  assert.deepEqual(caroFindings(r), []);
});

test("each adverse wording is raised, quoted, and carries its clause: default, wilful defaulter, fraud, section 143(12), cash losses, going concern, CSR, unrecorded income, inventory", () => {
  const cases: [string, string, string][] = [
    ["ix", "(ix) (a) The Company has defaulted in repayment of term loans to State Bank of India amounting to Rs 42 crore and in payment of interest thereon.", "defaulted in repayment of term loans"],
    ["ix", "(ix) (b) The Company has been declared a wilful defaulter by a bank.", "declared a wilful defaulter"],
    ["xi", "(xi) (a) A fraud by the Company amounting to Rs 3 crore has been noticed and reported during the year.", "fraud by the Company amounting to Rs 3 crore"],
    ["xi", "(xi) (a) No fraud has been noticed. (b) A report under section 143(12) of the Act has been filed by us in Form ADT-4 with the Central Government.", "report under section 143(12)"],
    ["xvii", "(xvii) The Company has incurred cash losses of Rs 18 crore in the current year and Rs 9 crore in the immediately preceding year.", "incurred cash losses of Rs 18 crore"],
    ["xix", "(xix) On the basis of our examination, a material uncertainty exists as on the date of the audit report that the Company is not capable of meeting its liabilities existing at the balance sheet date.", "material uncertainty exists"],
    ["xx", "(xx) (a) The Company has not transferred the unspent amount of Rs 4 crore to a Fund specified in Schedule VII within six months.", "has not transferred the unspent amount"],
    ["viii", "(viii) Income of Rs 25 crore has been surrendered or disclosed as income during the year in the tax assessments under the Income Tax Act, 1961.", "surrendered or disclosed as income"],
    ["ii", "(ii) (a) Discrepancies of 12%, more than 10% in the aggregate for a class of inventory, were noticed on verification.", "Discrepancies of 12%"],
  ];
  for (const [id, text, needle] of cases) {
    const c = clause({ [id]: text }, id);
    assert.equal(c.status, "adverse", `${id}: ${text}`);
    assert.ok(c.excerpt.includes(needle), `${id} excerpt ${c.excerpt}`);
  }
  const all = caroFindings(readCaro(annexure({ ix: cases[0][1], xvii: cases[4][1] })));
  assert.deepEqual(all.map((f) => [f.id, f.severity]), [["caro_ix", "high"], ["caro_xvii", "high"]]);
});

test("an auditor's own explanation in the same sentence is not raised: CSR not yet transferred because the 30 days have not elapsed", () => {
  const c = clause({ xx: "(xx) (b) The Company has not transferred the unspent CSR amount as at the Balance Sheet date to a Special Account till the date of our report since the time period for such transfer, i.e., 30 days from the end of the financial year, has not elapsed." }, "xx");
  assert.notEqual(c.status, "adverse");
});

test("wording that is neither the standard clean nor the standard adverse form is 'read it', never 'clear' - and a high-signal clause is still surfaced as information", () => {
  const c = clause({ xvii: "(xvii) Cash position of the Company is monitored by the board on a monthly basis." }, "xvii");
  assert.equal(c.status, "read_it");
  const f = caroFindings(readCaro(annexure({ xvii: "(xvii) Cash position of the Company is monitored by the board on a monthly basis." })));
  assert.deepEqual(f.map((x) => [x.id, x.severity]), [["caro_xvii_read", "info"]]);
});

test("a list of numerals that is not an annexure is not read as one", () => {
  const page = { num: 1, text: "(i) first point about Property, Plant and Equipment and full particulars\n(ii) second\n(iii) third" };
  assert.deepEqual(readCaro([page]), []);
});

test("a consolidated annexure with only clause (xxi): 'did not include any unfavourable answers' is clear", () => {
  const r = readCaro(load("tcs")).find((x) => x.scope === "consolidated")!;
  assert.deepEqual(r.clauses.map((c) => [c.id, c.status]), [["xxi", "clear"]]);
  assert.deepEqual(r.pages, [163]);
});

test("an amount with a decimal point or 'Rs.' does not cut the sentence short: 'Rs. 3.5 crore' is read whole, and the excerpt keeps its full stops", () => {
  const c = clause({ xi: "(xi) (a) A fraud by the Company amounting to Rs. 3.5 crore has been noticed and reported during the year." }, "xi");
  assert.equal(c.status, "adverse");
  assert.match(c.excerpt, /Rs\. 3\.5 crore/);
  const d = clause({ xvii: "(xvii) The Company has incurred cash losses of Rs. 18.25 crore in the current year." }, "xvii");
  assert.equal(d.status, "adverse");
  assert.match(d.excerpt, /Rs\. 18\.25 crore/);
});
