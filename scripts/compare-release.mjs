// Tells whether an address already serves the content of the package in dist/. A commit that changes
// nothing in the game (documentation, tests) builds the same content, and publishing it again would only
// make every player's browser fetch the game once more.
//
// Usage: node scripts/compare-release.mjs <url> [--dist <dir>]  (run after `pnpm build`)
//
// Prints "same" or "different"; in a workflow it also sets the step output `same_content`. An address that
// does not answer, or answers with something else, is "different". A different package whose version is not
// above the deployed one is refused (exit 1): players would see an old number on a new game.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { servesContent } from "./lib/deployment-rules.mjs";
import { RELEASE_FILES } from "./lib/release-rules.mjs";
import { findPublishProblems } from "./lib/version-rules.mjs";

const REQUEST_TIMEOUT_MS = 20_000;

async function servedRelease(origin) {
  try {
    const response = await fetch(`${origin}/${RELEASE_FILES.RELEASE_JSON}`, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

// The version the deployed release names; none for a release from before the versions, or no answer.
function servedVersionOf(text) {
  try {
    const { version } = JSON.parse(text);
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { dist: { type: "string", default: "dist" } },
  });
  const address = positionals[0];
  if (address === undefined || !/^https?:\/\/[^/]+\/?$/.test(address)) {
    console.error("compare-release: give the address of the game, for example https://game.example");
    return 1;
  }
  const local = JSON.parse(readFileSync(join(values.dist, RELEASE_FILES.RELEASE_JSON), "utf8"));
  const servedText = await servedRelease(address.replace(/\/$/, ""));
  const same = servesContent(servedText, local.contentId);
  console.log(same ? "same" : "different");
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile !== undefined && outputFile !== "") appendFileSync(outputFile, `same_content=${same}\n`);
  const problems = findPublishProblems({
    localVersion: local.version,
    servedVersion: servedVersionOf(servedText),
    sameContent: same,
  });
  for (const problem of problems) console.error(`compare-release: ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = await main();
