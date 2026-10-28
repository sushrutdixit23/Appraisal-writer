// A small in-memory stand-in for the two services the Sentinel routes talk to, served over real
// HTTP so the real supabase-js client and the real Anthropic SDK code paths run unchanged:
//
//   Supabase  /auth/v1/user and a PostgREST subset at /rest/v1/<table>
//             (select, eq/neq/in/is/gt/gte/lt/lte/or filters, order, limit, insert, upsert,
//              update, delete, single/maybeSingle, unique keys)
//   Anthropic /v1/messages  (returns whatever the test's reply function says)
//
// It is deliberately NOT a copy of Supabase's row-level security: server routes use the service
// key, which bypasses it, and that is the behaviour under test. `rls: true` turns on a simple
// owner-or-reference policy for requests that carry a user token instead of the service key, so
// the browser pages can be exercised under the same rule the real policies are meant to express.

import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

export type Row = Record<string, any>;
export const SERVICE_TOKEN = "service-role-key";

type Reply = { text: string; usage?: Record<string, number> } | { json: unknown; status?: number };

export class FakeBackend {
  tables: Record<string, Row[]> = {};
  users = new Map<string, { id: string; email: string }>();
  unique: Record<string, string[]> = { sentinel_statements: ["workspace_id", "period_label", "basis"] };
  rls = false;
  anthropicCalls: any[] = [];
  anthropicReply: (body: any) => Reply = () => ({ text: "{}" });
  /** When set, answers instead of anthropicReply (may be async) - used to point an opt-in evaluation at the real API. */
  anthropicForward: ((body: any) => Promise<Reply>) | null = null;
  failNext: { table: string; method: string; status: number; body: unknown } | null = null;
  requestLog: { method: string; path: string }[] = [];
  private server!: http.Server;
  url = "";

  addUser(token: string, id: string, email = `${id}@example.com`) {
    this.users.set(token, { id, email });
  }
  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows.map((r) => ({ id: randomUUID(), ...r }))];
  }
  rowsOf(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  async start(port = 0): Promise<string> {
    this.server = http.createServer((req, res) => this.handle(req, res).catch((e) => this.send(res, 500, { message: String(e?.stack ?? e) })));
    await new Promise<void>((r) => this.server.listen(port, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }
  async stop() {
    this.server.closeAllConnections?.();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  private cors(res: http.ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS,PUT");
    res.setHeader("Access-Control-Expose-Headers", "*");
  }
  private send(res: http.ServerResponse, status: number, body: unknown) {
    this.cors(res);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(body === undefined ? "" : JSON.stringify(body));
  }
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", this.url);
    this.requestLog.push({ method: req.method ?? "", path: url.pathname });
    if (req.method === "OPTIONS") {
      this.cors(res);
      res.statusCode = 204;
      return res.end();
    }
    const raw = await this.readBody(req);
    const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";

    if (url.pathname === "/auth/v1/user") {
      const user = this.users.get(token);
      if (!user) return this.send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return this.send(res, 200, {
        id: user.id, aud: "authenticated", role: "authenticated", email: user.email,
        app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
      });
    }

    if (url.pathname === "/v1/messages" && req.method === "POST") {
      const body = JSON.parse(raw || "{}");
      this.anthropicCalls.push(body);
      const reply = this.anthropicForward ? await this.anthropicForward(body) : this.anthropicReply(body);
      if ("json" in reply) return this.send(res, reply.status ?? 200, reply.json);
      return this.send(res, 200, {
        id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: reply.text }], usage: reply.usage ?? { input_tokens: 1, output_tokens: 1 },
      });
    }

    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!m) return this.send(res, 404, { message: `no route ${url.pathname}` });
    return this.rest(req, res, m[1], url, raw, token);
  }

  // ----- PostgREST subset ------------------------------------------------------------------

  private matches(row: Row, key: string, expr: string): boolean {
    const [op, ...rest] = expr.split(".");
    const val = rest.join(".");
    const cell = row[key];
    const str = cell === null || cell === undefined ? null : String(cell);
    switch (op) {
      case "eq": return str === val;
      case "neq": return str !== val;
      case "is": return val === "null" ? cell == null : String(cell) === val;
      case "in": {
        const items = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
        return str !== null && items.includes(str);
      }
      case "gt": return str !== null && str > val;
      case "gte": return str !== null && str >= val;
      case "lt": return str !== null && str < val;
      case "lte": return str !== null && str <= val;
      default: throw new Error(`unsupported operator ${op}`);
    }
  }
  private filterRows(rows: Row[], url: URL): Row[] {
    let out = rows;
    for (const [key, expr] of url.searchParams) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
      if (key === "or") {
        const parts = expr.replace(/^\(|\)$/g, "").split(",");
        out = out.filter((r) => parts.some((p) => { const i = p.indexOf("."); return this.matches(r, p.slice(0, i), p.slice(i + 1)); }));
      } else {
        out = out.filter((r) => this.matches(r, key, expr));
      }
    }
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1));
    }
    const limit = url.searchParams.get("limit");
    if (limit) out = out.slice(0, Number(limit));
    return out;
  }

  /** Simple stand-in for the row-level-security policies: your own companies and the reference
   * set are visible; only your own are writable. Rows of the other tables follow their company. */
  private visible(table: string, row: Row, uid: string, write: boolean): boolean {
    const wsOf = (id: string) => this.rowsOf("sentinel_workspaces").find((w) => w.id === id);
    if (table === "sentinel_workspaces") return row.owner_id === uid || (!write && row.is_public_reference === true);
    const ws = row.workspace_id ? wsOf(row.workspace_id) : undefined;
    if (!ws) return row.owner_id === uid || row.created_by === uid;
    if (table === "sentinel_statements") return ws.owner_id === uid || (!write && ws.is_public_reference === true);
    return ws.owner_id === uid || row.owner_id === uid || row.created_by === uid;
  }

  private async rest(req: http.IncomingMessage, res: http.ServerResponse, table: string, url: URL, raw: string, token: string) {
    if (this.failNext && this.failNext.table === table && this.failNext.method === req.method) {
      const f = this.failNext;
      this.failNext = null;
      return this.send(res, f.status, f.body);
    }
    const uid = this.users.get(token)?.id;
    const service = token === SERVICE_TOKEN;
    const enforce = this.rls && !service;
    if (enforce && !uid) return this.send(res, 401, { message: "JWT required" });

    const rows = (this.tables[table] ??= []);
    const prefer = String(req.headers.prefer ?? "");
    const wantsRows = prefer.includes("return=representation");
    const wantsObject = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
    const respond = (status: number, list: Row[]) => {
      if (wantsObject) {
        if (list.length !== 1) {
          return this.send(res, 406, { code: "PGRST116", details: `The result contains ${list.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
        }
        return this.send(res, status, list[0]);
      }
      return this.send(res, status, list);
    };

    if (req.method === "GET") {
      let list = this.filterRows(rows, url);
      if (enforce) list = list.filter((r) => this.visible(table, r, uid!, false));
      return respond(200, list);
    }

    if (req.method === "POST") {
      const payload = JSON.parse(raw || "[]");
      const incoming: Row[] = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      const upsert = prefer.includes("resolution=merge-duplicates");
      const conflictCols = (url.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
      for (const item of incoming) {
        if (enforce && !this.visible(table, item, uid!, true)) {
          return this.send(res, 403, { code: "42501", message: `new row violates row-level security policy for table "${table}"` });
        }
        const keys = conflictCols.length ? conflictCols : this.unique[table] ?? [];
        const clash = keys.length ? rows.find((r) => keys.every((k) => String(r[k]) === String(item[k]))) : undefined;
        if (clash && upsert) {
          Object.assign(clash, item);
          out.push(clash);
          continue;
        }
        if (clash) {
          return this.send(res, 409, { code: "23505", message: `duplicate key value violates unique constraint "${table}_${keys.join("_")}_key"`, details: "", hint: null });
        }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...item };
        rows.push(row);
        out.push(row);
      }
      return wantsRows ? respond(201, out) : this.send(res, 201, undefined);
    }

    if (req.method === "PATCH") {
      const patch = JSON.parse(raw || "{}");
      let targets = this.filterRows(rows, url);
      if (enforce) targets = targets.filter((r) => this.visible(table, r, uid!, true));
      targets.forEach((r) => Object.assign(r, patch));
      return wantsRows ? respond(200, targets) : this.send(res, 204, undefined);
    }

    if (req.method === "DELETE") {
      let targets = this.filterRows(rows, url);
      if (enforce) targets = targets.filter((r) => this.visible(table, r, uid!, true));
      this.tables[table] = rows.filter((r) => !targets.includes(r));
      return wantsRows ? respond(200, targets) : this.send(res, 204, undefined);
    }

    return this.send(res, 405, { message: "method not allowed" });
  }
}

/** Point the process at a running fake, the way the deployed app is pointed at Supabase. */
export function useBackend(b: FakeBackend) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = b.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_TOKEN;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = b.url;
}
