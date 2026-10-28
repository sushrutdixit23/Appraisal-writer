// Builds and runs the Tally agent (tally-agent.ts) with the project's own
// TypeScript, the same throwaway-compile pattern as score-extraction.mjs.
//
//   npm run tally:agent -- --link <upload link> --from YYYY-MM-DD --to YYYY-MM-DD
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const build = spawnSync(process.execPath, [tsc, "-p", join(root, "scripts", "tsconfig.tally-agent.json")], {
  stdio: "inherit",
  cwd: root,
});
if (build.status !== 0) {
  console.error("TypeScript build of the Tally agent failed.");
  process.exit(build.status ?? 1);
}

const entry = join(root, "node_modules", ".cache", "tally-agent", "scripts", "tally-agent.js");
const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
