// Sentinel test runner. Compiles tests/sentinel (and the library and route
// code they import) with the project's own TypeScript into a throwaway
// folder under node_modules/.cache, then runs Node's built-in test runner
// on the output. No test framework or extra dependency is needed.
//
//   npm run test:sentinel
//   npm run test:sentinel -- --test-name-pattern "days"
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules", ".cache", "sentinel-tests");
rmSync(out, { recursive: true, force: true });

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "tests", "sentinel", "tsconfig.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the Sentinel tests failed.");
  process.exit(build.status ?? 1);
}

const testDir = join(out, "tests", "sentinel");
const files = existsSync(testDir)
  ? readdirSync(testDir).filter((f) => f.endsWith(".test.js")).map((f) => join(testDir, f))
  : [];
if (files.length === 0) {
  console.error("No compiled tests found.");
  process.exit(1);
}
const extra = process.argv.slice(2);
const run = spawnSync(process.execPath, ["--test", ...extra, ...files], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
