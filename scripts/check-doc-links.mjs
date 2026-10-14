// Guards the documentation of the repository: every relative Markdown link and every backticked path that starts
// with a directory of the repository must still exist. The rules live in scripts/lib/doc-link-rules.mjs.
// Usage: node scripts/check-doc-links.mjs  (from the repository root; reads the Markdown files git tracks)
//
// A path exists when git tracks it (a file, or a directory that holds tracked files) or ignores it (the output
// of a build or a test run, which a fresh checkout does not have yet). Files on the disk that git neither
// tracks nor ignores do not count, so the answer is the same on a developer's machine and in CI.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { findDocLinkProblems } from "./lib/doc-link-rules.mjs";

function trackedFiles(...patterns) {
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], { encoding: "utf8" });
  return output.split("\0").filter((path) => path !== "");
}

/** The directories above a file, nearest first. */
function directoriesOf(file) {
  const parents = [];
  for (let dir = posix.dirname(file); dir !== "."; dir = posix.dirname(dir)) parents.push(dir);
  return parents;
}

/** Every tracked file and every directory above one. */
const trackedPaths = (files) => new Set(files.flatMap((file) => [file, ...directoriesOf(file)]));

/** Exit status 0 of `git check-ignore` means the path is ignored; 1 means it is not. */
const isIgnored = (path) => spawnSync("git", ["check-ignore", "-q", "--no-index", "--", path]).status === 0;

function main() {
  const tracked = trackedFiles();
  const known = trackedPaths(tracked);
  const roots = [...new Set(tracked.filter((path) => path.includes("/")).map((path) => path.split("/")[0]))];
  const exists = (path) => known.has(path) || isIgnored(path);
  const docs = trackedFiles("*.md").map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const problems = findDocLinkProblems(docs, { exists, roots });
  for (const problem of problems) console.error(`check:doc-links: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`check:doc-links: ${docs.length} documents, no dead links or paths`);
  return 0;
}

process.exitCode = main();
