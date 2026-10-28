// Scheduled jobs: closed unless the secret matches, and a readable digest message.

import test from "node:test";
import assert from "node:assert/strict";
import { cronAuthorised, digestMessage } from "../../app/sentinel/lib/cron";
import type { Digest } from "../../app/sentinel/lib/digest";

const req = (auth?: string) => new Request("http://x/cron", { headers: auth ? { authorization: auth } : {} });

test("cron routes are closed with no secret configured, and open only to the exact bearer token", () => {
  assert.equal(cronAuthorised(req("Bearer s3cret"), undefined), false);
  assert.equal(cronAuthorised(req("Bearer s3cret"), ""), false);
  assert.equal(cronAuthorised(req(), "s3cret"), false);
  assert.equal(cronAuthorised(req("Bearer wrong"), "s3cret"), false);
  assert.equal(cronAuthorised(req("Bearer s3cret"), "s3cret"), true);
});

test("the digest message names the headline, shows the top items per section and counts the rest", () => {
  const item = (t: string) => ({ workspace_id: "a", company_name: "A", title: t, detail: "d", href: "/" });
  const digest: Digest = { total: 5, sections: [
    { id: "decide", title: "Waiting for your decision", empty: "", items: [item("one"), item("two"), item("three"), item("four")] },
    { id: "investigate", title: "Flagged", empty: "", items: [] },
    { id: "data", title: "Stale", empty: "", items: [item("stale one")] },
  ] };
  const m = digestMessage("Acme", digest, "https://app.example.com/");
  assert.match(m, /Sentinel digest for Acme: 5 items need attention\./);
  assert.match(m, /Waiting for your decision \(4\)\n  - one\n  - two\n  - three\n  \.\.\.and 1 more/);
  assert.ok(!m.includes("Flagged"), "an empty section is left out");
  assert.match(m, /Open: https:\/\/app\.example\.com\/sentinel\/digest/);
  assert.match(digestMessage("Acme", { total: 0, sections: [] }, null), /nothing needs attention today/);
});
