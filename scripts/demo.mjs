// npm run demo: Sentinel on fictional data, with no Supabase and no sign-in. Starts a fake Supabase (tests/sentinel/e2e/serve-fake.cjs) seeded with
// a five-year history, then the Next dev server pointed at it, and prints the address to open. Nothing here touches a real database or key.
//
//   npm run demo            then open  http://localhost:3100/demo-signin
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_PORT = 4010, APP_PORT = 3100;

console.log("Compiling the fake backend (about a minute the first time)...");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "tests", "sentinel", "tsconfig.json")], { stdio: "inherit", cwd: root });
if (build.status !== 0) { console.error("Could not compile the fake backend."); process.exit(build.status ?? 1); }

const children = [];
const stop = () => { for (const c of children) { try { c.kill(); } catch { /* already gone */ } } };
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("exit", stop);

const fake = spawn(process.execPath, [join(root, "tests", "sentinel", "e2e", "serve-fake.cjs"), String(FAKE_PORT)], { cwd: root, env: { ...process.env, SENTINEL_DEMO: "1" }, stdio: "inherit" });
children.push(fake);
fake.on("exit", (code) => { if (code) { console.error(`The fake backend stopped (code ${code}). Is port ${FAKE_PORT} already in use?`); process.exit(code); } });

const env = {
  ...process.env,
  NEXT_PUBLIC_SENTINEL_DEMO: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  ANTHROPIC_API_KEY: "demo-not-a-real-key",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
};
const next = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(APP_PORT)], { cwd: root, env, stdio: "inherit" });
children.push(next);
next.on("exit", (code) => { stop(); process.exit(code ?? 0); });
setTimeout(() => console.log(`\n  Open  http://localhost:${APP_PORT}/demo-signin   (fictional data; Ctrl+C stops both servers)\n`), 6000);
