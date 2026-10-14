// Checks the version of a pull request: one that changes the game moves `version` in package.json by the step
// its title names, any other leaves it as it was. The rules live in scripts/lib/version-rules.mjs.
//
// Usage: node scripts/check-version.mjs --base <commit> --title "<pull request title>"
//   (compares the checked-out commit with <commit>, the head of the default branch it merges into)
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import { findVersionProblems } from "./lib/version-rules.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function main() {
  const { values } = parseArgs({ options: { base: { type: "string" }, title: { type: "string" } } });
  if (values.base === undefined || values.title === undefined) {
    console.error('check-version: give --base <commit> and --title "<pull request title>"');
    return 1;
  }
  const changedPaths = git("diff", "--name-only", values.base, "HEAD")
    .split("\n")
    .filter((path) => path !== "");
  const problems = findVersionProblems({
    title: values.title,
    changedPaths,
    basePackage: JSON.parse(git("show", `${values.base}:package.json`)),
    headPackage: JSON.parse(git("show", "HEAD:package.json")),
  });
  for (const problem of problems) console.error(`check-version: ${problem}`);
  if (problems.length === 0)
    console.log(`check-version: ${JSON.parse(git("show", "HEAD:package.json")).version}, as it should be`);
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main();
