// Builds and runs the outside-review sample CLI (review-sample.ts) with the project's own TypeScript,
// the same throwaway-compile pattern as test-sentinel.mjs.
//
//   npm run review:sample -- <items.csv> [--n 100] [--overlap 30]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "scripts", "tsconfig.review-sample.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the evaluation CLI failed.");
  process.exit(build.status ?? 1);
}

const entry = join(root, "node_modules", ".cache", "review-sample", "scripts", "review-sample.js");
const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
