// Sentinel - reading a trial balance out of Tally Prime. Tally answers XML requests on a local port (9000 by default);
// asking it for a Collection of Ledgers with each one's parent group and closing balance gives a ledger-wise trial
// balance with no report layout to scrape. This file is the pure half: build the request, read the reply, write the CSV
// the trial-balance reader already understands. The script that talks to Tally and to Sentinel is scripts/tally-agent.ts.
//
// What is NOT verified from here: the reply format below is written from Tally's documented XML collection export,
// tested against hand-written fixtures, never against a running Tally. The sign convention is the one assumption
// that would silently corrupt a balance sheet if wrong, so it is checked against the ledgers' own groups.

export type TallyLedger = { ledger: string; group: string; debit: number; credit: number };

export type TallyReading = {
  ledgers: TallyLedger[];
  /** Plain-language notes the person should see: a flipped sign, ledgers skipped, a trial balance that does not balance. */
  notes: string[];
  totalDebit: number;
  totalCredit: number;
};

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** YYYY-MM-DD -> Tally's YYYYMMDD. Throws on anything else, so a mistyped date never silently asks for the wrong year. */
export function tallyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Date must be YYYY-MM-DD, got "${iso}".`);
  return iso.replace(/-/g, "");
}

/** The request body for a ledger-wise trial balance as at `to` (the year starts at `from`). `company` selects one of
 * several open companies; leave it out to use whichever is open in Tally. */
export function ledgerCollectionRequest(opts: { from: string; to: string; company?: string }): string {
  const company = opts.company ? `<SVCURRENTCOMPANY>${xmlEscape(opts.company)}</SVCURRENTCOMPANY>` : "";
  return (
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>SentinelLedgers</ID></HEADER>` +
    `<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>` +
    `<SVFROMDATE>${tallyDate(opts.from)}</SVFROMDATE><SVTODATE>${tallyDate(opts.to)}</SVTODATE>${company}</STATICVARIABLES>` +
    `<TDL><TDLMESSAGE><COLLECTION NAME="SentinelLedgers" ISMODIFY="No"><TYPE>Ledger</TYPE>` +
    `<FETCH>Name,Parent,ClosingBalance</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`
  );
}

function decode(s: string): string {
  return s
    .replace(/&#\d+;/g, (m) => {
      const n = Number(m.slice(2, -1));
      // Tally writes control characters (&#4; and friends) as separators inside names; they are not text.
      return n < 32 ? "" : String.fromCodePoint(n);
    })
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]) : null;
};

/** A Tally amount: plain signed ("-5000.00"), possibly with a trailing Dr/Cr ("5,000.00 Dr"). In Tally's XML a debit
 * is NEGATIVE and a credit POSITIVE; a Dr/Cr suffix is explicit and wins. Returns a signed number where + is debit. */
function amount(raw: string | null, nativeSign: boolean): number | null {
  if (raw == null || raw === "") return null;
  const m = /^(.*?)\s*(dr|cr)\.?$/i.exec(raw);
  const n = Number((m ? m[1] : raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m) return m[2].toLowerCase() === "cr" ? -Math.abs(n) : Math.abs(n);
  return nativeSign ? -n : n;
}

// Groups whose normal balance is known, used only to confirm the sign convention.
const DEBIT_NATURE = /^(sundry debtors|bank accounts|cash-in-hand|fixed assets|purchase accounts|direct expenses|indirect expenses|stock-in-hand|deposits \(asset\)|loans & advances \(asset\)|investments)$/i;
const CREDIT_NATURE = /^(sundry creditors|sales accounts|direct incomes|indirect incomes|capital account|reserves & surplus|secured loans|unsecured loans|bank od a\/c|provisions|duties & taxes)$/i;

/** Reads the collection reply. Zero balances are dropped (the trial-balance reader drops them too). */
export function parseLedgerCollection(xml: string): TallyReading {
  const blocks = [...xml.matchAll(/<LEDGER(\s[^>]*)?>([\s\S]*?)<\/LEDGER>/gi)];
  const notes: string[] = [];
  if (blocks.length === 0) {
    throw new Error("Tally's reply had no ledgers. Is a company open in Tally, and is the ODBC/XML port enabled (F1 > Settings > Connectivity)?");
  }
  const parsed = (nativeSign: boolean) => {
    const out: TallyLedger[] = [];
    let skipped = 0;
    for (const b of blocks) {
      const attrs = b[1] ?? "";
      const body = b[2];
      const name = decode(/NAME="([^"]*)"/i.exec(attrs)?.[1] ?? "") || tag(body, "NAME") || "";
      const v = amount(tag(body, "CLOSINGBALANCE"), nativeSign);
      if (!name) { skipped++; continue; }
      if (v == null || v === 0) continue;
      out.push({ ledger: name, group: tag(body, "PARENT") ?? "", debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 });
    }
    return { out, skipped };
  };

  let { out: ledgers, skipped } = parsed(true);
  // Under Tally's own convention a debit-nature group (debtors, bank, expenses) nets to debit. If every sign says the
  // opposite, the reply used the other convention: flip, and say so.
  const net = (rows: TallyLedger[], re: RegExp) => rows.filter((l) => re.test(l.group)).reduce((n, l) => n + l.debit - l.credit, 0);
  const debitGroupsNet = net(ledgers, DEBIT_NATURE);
  const creditGroupsNet = net(ledgers, CREDIT_NATURE);
  if (debitGroupsNet < 0 && creditGroupsNet > 0) {
    ({ out: ledgers } = parsed(false));
    notes.push("This Tally reply showed debits as positive numbers (the opposite of Tally's usual XML); the groups confirmed it, so the balances were read that way.");
  }
  if (skipped) notes.push(`${skipped} ledger${skipped > 1 ? "s" : ""} had no name and ${skipped > 1 ? "were" : "was"} skipped.`);

  const totalDebit = ledgers.reduce((n, l) => n + l.debit, 0);
  const totalCredit = ledgers.reduce((n, l) => n + l.credit, 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  if (Math.abs(diff) >= 1) {
    notes.push(
      `The trial balance does not balance: debits ${totalDebit.toFixed(2)} against credits ${totalCredit.toFixed(2)} (${diff > 0 ? "debits" : "credits"} higher by ${Math.abs(diff).toFixed(2)}). ` +
        `A closing stock figure kept outside the ledgers is the usual cause. Sentinel will refuse an unbalanced trial balance.`
    );
  }
  return { ledgers, notes, totalDebit, totalCredit };
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const money = (n: number) => (n === 0 ? "" : n.toFixed(2));

/** The CSV the trial-balance reader recognises: Ledger, Group, Debit, Credit, one row per ledger. */
export function ledgersToCsv(ledgers: TallyLedger[]): string {
  const lines = ["Ledger,Group,Debit,Credit", ...ledgers.map((l) => [csvCell(l.ledger), csvCell(l.group), money(l.debit), money(l.credit)].join(","))];
  return `${lines.join("\n")}\n`;
}

/** Accepts the whole upload link a data request produced ("https://host/submit/<token>") or the bare token, and returns
 * the submit API URL. */
export function submitUrl(link: string): string {
  const t = link.trim();
  const m = /^(https?:\/\/[^/]+)\/(?:api\/sentinel\/)?submit\/([A-Za-z0-9_-]{32})\/?$/.exec(t);
  if (!m) throw new Error("The upload link should look like https://your-app/submit/<32-character token>.");
  return `${m[1]}/api/sentinel/submit/${m[2]}`;
}
