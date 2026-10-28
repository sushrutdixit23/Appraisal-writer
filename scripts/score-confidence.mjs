// Builds and runs the confidence-calibration CLI (score-confidence.ts) with the project's own
// TypeScript, the same throwaway-compile pattern as score-extraction.mjs.
//
//   npm run score:confidence -- investigations.json
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "scripts", "tsconfig.score-confidence.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the confidence-calibration CLI failed.");
  process.exit(build.status ?? 1);
}

const entry = join(root, "node_modules", ".cache", "score-confidence", "scripts", "score-confidence.js");
const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
