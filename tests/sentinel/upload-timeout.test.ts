// uploadClient's own timeout: a read that never answers must become a clear, timed-out error, not an
// indefinitely pending promise - the bug behind the Import page hanging on "Reading..." for 5+ minutes with
// nothing on screen to say whether it was still working.
//
// supabase.auth.getSession() is monkeypatched for these tests: the browser client has no real session in
// Node, and sendFile's very first line needs one before it will do anything else.

import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { supabase } from "../../app/lib/supabase";
import { sendFile, UploadError } from "../../app/sentinel/lib/uploadClient";
import * as autofillRoute from "../../app/api/sentinel/autofill/route";
import * as extractRoute from "../../app/api/sentinel/extract/route";

type Auth = typeof supabase.auth;
const realGetSession = supabase.auth.getSession.bind(supabase.auth);

function fakeSignedIn() {
  (supabase.auth as Auth).getSession = (async () => ({
    data: { session: { access_token: "tok" } },
    error: null,
  })) as Auth["getSession"];
}
function fakeSignedOut() {
  (supabase.auth as Auth).getSession = (async () => ({ data: { session: null }, error: null })) as Auth["getSession"];
}
afterEach(() => {
  (supabase.auth as Auth).getSession = realGetSession;
});

function serveOnce(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}
const file = (name = "report.csv") => new File(["revenue,1000\n"], name, { type: "text/csv" });

test("a quick, successful read resolves normally", async () => {
  fakeSignedIn();
  const srv = await serveOnce((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const body = await sendFile<{ ok: boolean }>(srv.url, file(), {});
    assert.deepEqual(body, { ok: true });
  } finally {
    srv.close();
  }
});

test("no session at all is refused before any request is sent", async () => {
  fakeSignedOut();
  let requested = false;
  const srv = await serveOnce((req, res) => {
    requested = true;
    res.end("{}");
  });
  try {
    await assert.rejects(sendFile(srv.url, file(), {}), (e) => e instanceof UploadError && e.unauthenticated);
    assert.equal(requested, false);
  } finally {
    srv.close();
  }
});

test("a server that never answers times out with a clear, specific error rather than hanging forever", async () => {
  fakeSignedIn();
  const srv = await serveOnce(() => {
    /* never respond, never close the connection */
  });
  try {
    await assert.rejects(
      sendFile(srv.url, file(), {}, { timeoutMs: 80 }),
      (e: unknown) => e instanceof UploadError && e.timedOut === true && /taking much longer/.test(e.message)
    );
  } finally {
    srv.close();
  }
});

test("the caller's own cancellation is a plain abort, not disguised as a timeout", async () => {
  fakeSignedIn();
  const srv = await serveOnce(() => {
    /* never respond */
  });
  const outer = new AbortController();
  const promise = sendFile(srv.url, file(), {}, { signal: outer.signal, timeoutMs: 60_000 });
  outer.abort();
  try {
    await assert.rejects(promise, (e: unknown) => !(e instanceof UploadError));
  } finally {
    srv.close();
  }
});

test("a server error response still surfaces its own message, unaffected by the timeout plumbing", async () => {
  fakeSignedIn();
  const srv = await serveOnce((req, res) => {
    res.writeHead(422, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "That file is not a recognised format." }));
  });
  try {
    await assert.rejects(sendFile(srv.url, file(), {}), (e: unknown) => e instanceof UploadError && e.message === "That file is not a recognised format." && !e.timedOut);
  } finally {
    srv.close();
  }
});

test("the autofill and extract routes both declare the 300s ceiling Vercel allows on every plan", () => {
  assert.equal(autofillRoute.maxDuration, 300);
  assert.equal(extractRoute.maxDuration, 300);
});
