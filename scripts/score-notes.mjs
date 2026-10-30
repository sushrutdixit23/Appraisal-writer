// Builds and runs the notes scorecard CLI (score-notes.ts) with the project's own TypeScript,
// the same throwaway-compile pattern as test-sentinel.mjs.
//
//   npm run score:notes -- <folder of PDFs> [--out dir] [--truth truth.json]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "scripts", "tsconfig.score-notes.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the evaluation CLI failed.");
  process.exit(build.status ?? 1);
}

const entry = join(root, "node_modules", ".cache", "score-notes", "scripts", "score-notes.js");
const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
