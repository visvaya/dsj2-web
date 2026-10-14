// Guards the documentation of the repository: every relative Markdown link and every backticked path that starts
// with a directory of the repository must still exist. The rules live in scripts/lib/doc-link-rules.mjs.
// Usage: node scripts/check-doc-links.mjs  (from the repository root; reads the Markdown files git tracks)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { findDocLinkProblems } from "./lib/doc-link-rules.mjs";

function trackedFiles(...patterns) {
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], { encoding: "utf8" });
  return output.split("\0").filter((path) => path !== "");
}

function main() {
  const tracked = trackedFiles();
  const roots = [...new Set(tracked.filter((path) => path.includes("/")).map((path) => path.split("/")[0]))];
  const docs = trackedFiles("*.md").map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const problems = findDocLinkProblems(docs, { exists: existsSync, roots });
  for (const problem of problems) console.error(`check:doc-links: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`check:doc-links: ${docs.length} documents, no dead links or paths`);
  return 0;
}

process.exitCode = main();
