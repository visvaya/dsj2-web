// Runs the pinned deployment tool from deploy/ and reports only what may appear in a public log
// (scripts/lib/wrangler-output.mjs): the identifier of the published version on success, the tool's output
// with everything about the account removed on failure.
//
// Usage: node scripts/run-wrangler.mjs <arguments of the tool...>
//   for example: node scripts/run-wrangler.mjs deploy --message <commit>
//   (run after `pnpm install --frozen-lockfile` in deploy/)
//
// The credentials come from CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. A missing one is an error:
// a deployment that did not happen must not look like one that did.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { redactOutput, versionIdOf } from "./lib/wrangler-output.mjs";

const DEPLOY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "deploy");
const TOOL = join(DEPLOY_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const CREDENTIALS = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("run-wrangler: give the arguments of the tool, for example `deploy`.");
    return 1;
  }
  const missing = CREDENTIALS.filter((name) => (process.env[name] ?? "") === "");
  if (missing.length > 0) {
    console.error(`run-wrangler: ${missing.join(" and ")} not set; nothing was published.`);
    return 1;
  }
  if (existsSync(TOOL) !== true) {
    console.error("run-wrangler: the tool is not installed; run `pnpm install --frozen-lockfile` in deploy/.");
    return 1;
  }
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: DEPLOY_DIR,
    encoding: "utf8",
    // No prompts, no colours, no usage reports.
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0", WRANGLER_SEND_METRICS: "false" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    const secrets = CREDENTIALS.map((name) => process.env[name]);
    console.error(redactOutput(output, secrets));
    console.error(`run-wrangler: \`${args[0]}\` failed with exit code ${result.status ?? "none"}.`);
    return 1;
  }
  const versionId = versionIdOf(output);
  console.log(`run-wrangler: \`${args[0]}\` succeeded; version ${versionId ?? "not reported by the tool"}.`);
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile !== undefined && outputFile !== "") appendFileSync(outputFile, `version_id=${versionId ?? ""}\n`);
  return 0;
}

process.exitCode = main();
