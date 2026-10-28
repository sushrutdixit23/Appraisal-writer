// Builds and runs the reference-universe seed generator (seed-reference-universe.ts) with the project's own
// TypeScript, the same throwaway-compile pattern as score-extraction.mjs.
//
//   npm run seed:reference
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "scripts", "tsconfig.seed-reference-universe.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the reference-universe seed generator failed.");
  process.exit(build.status ?? 1);
}

const entry = join(root, "node_modules", ".cache", "seed-reference-universe", "scripts", "seed-reference-universe.js");
const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
