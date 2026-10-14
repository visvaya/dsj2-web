// Sets `version` in package.json for a pull request about to be opened: the next version after the one on the
// default branch, by the step the title names, when the change touches the game; the same version otherwise.
// The same rules check the pull request in CI (scripts/check-version.mjs).
//
// Usage: node scripts/bump-version.mjs "<pull request title>" [--base <ref>]   (default base: origin/master)
//   Compares the working tree, uncommitted changes included, with the point where it left <ref>.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { bumpOfTitle, changesTheGame, nextVersion } from "./lib/version-rules.mjs";

const PACKAGE_FILE = "package.json";
const VERSION_FIELD = /"version": "[^"]*"/;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string", default: "origin/master" } },
  });
  const title = positionals[0];
  if (title === undefined) {
    console.error('bump-version: give the title of the pull request, for example "feat(ui): show the version"');
    return 1;
  }
  const fork = git("merge-base", values.base, "HEAD").trim();
  const basePackage = JSON.parse(git("show", `${fork}:${PACKAGE_FILE}`));
  const text = readFileSync(PACKAGE_FILE, "utf8");
  const headPackage = JSON.parse(text);
  const changedPaths = git("diff", "--name-only", fork)
    .split("\n")
    .filter((path) => path !== "");
  const version =
    changesTheGame(changedPaths, basePackage, headPackage) === true
      ? nextVersion(basePackage.version, bumpOfTitle(title))
      : basePackage.version;
  writeFileSync(PACKAGE_FILE, text.replace(VERSION_FIELD, `"version": "${version}"`));
  console.log(`bump-version: ${basePackage.version} on ${values.base}, ${version} here`);
  return 0;
}

process.exitCode = main();
