// Sends a company's trial balance from Tally Prime to a Sentinel upload link. Run it on the machine where Tally is open
// (Tally must have its XML port enabled: F1 > Settings > Connectivity > Client/Server, default port 9000). Nothing is
// installed on the company's side beyond Node 18+; nothing leaves the machine except the ledger-wise trial balance, sent
// to the one link you give it.
//
//   npm run tally:agent -- --link https://your-app/submit/<token> --from 2025-04-01 --to 2026-03-31
//   npm run tally:agent -- --dry-run --from 2025-04-01 --to 2026-03-31 --out tb.csv     (read Tally, send nothing)
//
// Options: --tally http://localhost:9000   --company "Name as open in Tally"   --link or env SENTINEL_UPLOAD_LINK
// Schedule it with Windows Task Scheduler or cron; each run sends a fresh draft for an analyst to review.
import { writeFileSync } from "node:fs";
import { ledgerCollectionRequest, ledgersToCsv, parseLedgerCollection, submitUrl } from "../app/sentinel/lib/tally";

function args() {
  const out: Record<string, string | true> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    out[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
  }
  return out;
}

async function main() {
  const o = args();
  const from = String(o.from ?? ""), to = String(o.to ?? "");
  if (!from || !to) throw new Error("Give the financial year with --from YYYY-MM-DD --to YYYY-MM-DD.");
  const tally = String(o.tally ?? "http://localhost:9000");
  const dry = o["dry-run"] === true;
  const link = String(o.link ?? process.env.SENTINEL_UPLOAD_LINK ?? "");
  if (!dry && !link) throw new Error("Give the upload link with --link (or SENTINEL_UPLOAD_LINK), or use --dry-run.");
  const target = dry ? null : submitUrl(link);

  let reply: string;
  try {
    const res = await fetch(tally, { method: "POST", headers: { "content-type": "text/xml" }, body: ledgerCollectionRequest({ from, to, company: typeof o.company === "string" ? o.company : undefined }) });
    reply = await res.text();
  } catch (e) {
    throw new Error(`Could not reach Tally at ${tally}. Is Tally open with its XML port enabled? (${(e as Error).message})`);
  }
  const reading = parseLedgerCollection(reply);
  for (const n of reading.notes) console.warn(`! ${n}`);
  console.log(`${reading.ledgers.length} ledgers, debits ${reading.totalDebit.toFixed(2)}, credits ${reading.totalCredit.toFixed(2)}.`);
  const csv = ledgersToCsv(reading.ledgers);

  if (dry) {
    if (typeof o.out === "string") { writeFileSync(o.out, csv); console.log(`Wrote ${o.out}. Nothing was sent.`); }
    else console.log(csv);
    return;
  }
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `tally-trial-balance-${to}.csv`);
  const res = await fetch(target!, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { error?: string; periods?: number; figures?: number; warnings?: string[] };
  if (!res.ok) throw new Error(body.error ?? `Sentinel answered ${res.status}.`);
  console.log(`Sent. Sentinel read ${body.figures ?? 0} figures for ${body.periods ?? 0} period(s); an analyst will review the draft.`);
  for (const w of body.warnings ?? []) console.warn(`! ${w}`);
}

main().catch((e) => { console.error(`Error: ${(e as Error).message}`); process.exit(1); });
