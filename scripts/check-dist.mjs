// Guards the production build: dist/ may hold only what the build produces, no file of
// the original game or data derived from it, and the bundles must stay within their gzip
// budgets. The rules live in scripts/lib/dist-rules.mjs.
// Usage: node scripts/check-dist.mjs  (run after `pnpm build`; it never builds by itself)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { DIST_BUDGETS, findDistProblems, formatDistSummary } from "./lib/dist-rules.mjs";

const DIST_DIR = "dist";
const HEAD_LENGTH_BYTES = 2;

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() === true ? listFiles(join(dir, entry.name), relative) : [relative];
  });
}

function describeFile(path) {
  const content = readFileSync(join(DIST_DIR, path));
  return { path, gzipBytes: gzipSync(content).length, head: content.subarray(0, HEAD_LENGTH_BYTES) };
}

function main() {
  if (existsSync(DIST_DIR) !== true) {
    console.error("check:dist: dist/ does not exist; run `pnpm build` first.");
    return 1;
  }
  const files = listFiles(DIST_DIR).map(describeFile);
  if (files.length === 0) {
    console.error("check:dist: dist/ is empty; run `pnpm build` first.");
    return 1;
  }
  const problems = findDistProblems(files, DIST_BUDGETS);
  for (const problem of problems) console.error(`check:dist: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`check:dist: ${formatDistSummary(files, DIST_BUDGETS)}`);
  return 0;
}

process.exitCode = main();
