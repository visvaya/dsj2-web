// Watches the deployed game from outside its host, on a schedule: the address answers, with a release that
// was built from a commit of the default branch; every file of that release is served with its bytes, its type
// and the headers the commit asks for (scripts/check-deployment.mjs); the certificate is not about to end; the
// start page answers in time. The rules live in scripts/lib/monitor-rules.mjs.
//
// Usage: node scripts/monitor-deployment.mjs <url> [--branch <ref>] [--repo <dir>] [--wait-s <seconds>]
//   --branch  the branch the served commit has to be on (default origin/master)
//   --repo    the checkout to ask, with its full history (default: this one)
//   --wait-s  how long the check of the files waits for a deployment under way to settle (default 120)
//
// Only reads: a handful of requests, nothing is changed anywhere. With GITHUB_STEP_SUMMARY set, the report is
// added to the summary of the job as well.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  MONITOR_LIMITS,
  certificateDaysLeft,
  findCertificateProblems,
  findResponseTimeProblems,
  monitorSummary,
  releaseOfAddress,
} from "./lib/monitor-rules.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_SCRIPT = join(PROJECT_ROOT, "scripts", "check-deployment.mjs");
// Copied into the package as it is, so the file of a commit is what its release has to be served under.
const HEADERS_SOURCE_PATH = "public/_headers";
const REQUEST_TIMEOUT_MS = 20_000;
// A deployment that lands in the middle of a run changes the release under it: the run then starts over, once.
const ATTEMPTS = 2;
const HTTPS_PORT = 443;

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function gitSucceeds(repo, args) {
  try {
    git(repo, args);
    return true;
  } catch {
    return false;
  }
}

async function servedRelease(origin) {
  const response = await fetch(`${origin}/release.json`, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`/release.json: HTTP ${response.status}, expected 200`);
  return releaseOfAddress(await response.text());
}

// The files of the served release against its commit: { problems, commitsBehind }.
function checkFiles(origin, release, { repo, branch, waitS }) {
  const sha = release.sourceSha;
  if (!gitSucceeds(repo, ["cat-file", "-e", `${sha}^{commit}`])) {
    return { problems: [`/release.json: commit ${sha} is not in the repository`] };
  }
  if (!gitSucceeds(repo, ["merge-base", "--is-ancestor", sha, branch])) {
    return { problems: [`/release.json: commit ${sha} is not on ${branch}`] };
  }
  const commitsBehind = Number(git(repo, ["rev-list", "--count", `${sha}..${branch}`]).trim());
  let headers;
  try {
    headers = git(repo, ["show", `${sha}:${HEADERS_SOURCE_PATH}`]);
  } catch {
    return { problems: [`commit ${sha} has no ${HEADERS_SOURCE_PATH}`], commitsBehind };
  }
  const directory = mkdtempSync(join(tmpdir(), "telemark-monitor-"));
  try {
    const headersFile = join(directory, "_headers");
    writeFileSync(headersFile, headers);
    const args = ["--served-release", "--source-sha", sha, "--headers", headersFile, "--wait-s", waitS];
    execFileSync(process.execPath, [CHECK_SCRIPT, origin, ...args], { stdio: "inherit" });
    return { problems: [], commitsBehind };
  } catch {
    return { problems: ["the deployed files are not those of the served release (named above)"], commitsBehind };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// The release and the check of its files: { release, problems, commitsBehind }.
async function checkRelease(origin, options) {
  let result = { problems: [] };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let release;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one attempt at a time
      release = await servedRelease(origin);
    } catch (error) {
      return { problems: [`the address does not serve a release: ${messageOf(error)}`] };
    }
    result = { release, ...checkFiles(origin, release, options) };
    if (result.problems.length === 0) return result;
    // oxlint-disable-next-line no-await-in-loop -- as above
    const now = await servedRelease(origin).catch(() => null);
    // Still the same release, so the problems are its own and not those of a deployment under way.
    if (now === null || (now.sourceSha === release.sourceSha && now.contentId === release.contentId)) return result;
  }
  return result;
}

// { validFromMs, validToMs } of the certificate the host presents. A certificate that is not trusted, or is
// for another name, fails the connection itself.
function certificateOf(url) {
  return new Promise((resolvePromise, reject) => {
    const port = url.port === "" ? HTTPS_PORT : Number(url.port);
    const options = { host: url.hostname, port, servername: url.hostname, timeout: REQUEST_TIMEOUT_MS };
    const socket = connect(options, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      resolvePromise({
        validFromMs: Date.parse(certificate.valid_from),
        validToMs: Date.parse(certificate.valid_to),
      });
    });
    socket.on("timeout", () => socket.destroy(new Error("the connection timed out")));
    socket.on("error", reject);
  });
}

async function checkCertificate(origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:") return { problems: [] };
  try {
    const certificate = await certificateOf(url);
    const nowMs = Date.now();
    return {
      daysLeft: certificateDaysLeft(certificate.validToMs, nowMs),
      problems: findCertificateProblems(certificate, nowMs, MONITOR_LIMITS.CERTIFICATE_MIN_DAYS_LEFT),
    };
  } catch (error) {
    return { problems: [`certificate: ${messageOf(error)}`] };
  }
}

// How long the start page takes, body included, in milliseconds; an answer that fails is not a sample.
async function timeStartPage(origin) {
  const samplesMs = [];
  for (let sample = 0; sample < MONITOR_LIMITS.START_PAGE_SAMPLES; sample++) {
    const startedMs = performance.now();
    try {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time: each is timed on its own
      const response = await fetch(`${origin}/`, {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await response.arrayBuffer();
      if (response.status === 200) samplesMs.push(performance.now() - startedMs);
    } catch {
      // Counted as a missing sample; the check of the files has already named an address that does not answer.
    }
  }
  return samplesMs;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      branch: { type: "string", default: "origin/master" },
      repo: { type: "string", default: PROJECT_ROOT },
      // A deployment takes a moment to reach every machine of the host.
      "wait-s": { type: "string", default: "120" },
    },
  });
  const address = positionals[0];
  if (address === undefined || !/^https?:\/\/[^/]+\/?$/.test(address)) {
    console.error("monitor-deployment: give the address of the game, for example https://game.example");
    return 1;
  }
  const origin = address.replace(/\/$/, "");

  const files = await checkRelease(origin, {
    repo: resolve(values.repo),
    branch: values.branch,
    waitS: values["wait-s"],
  });
  const certificate = await checkCertificate(origin);
  const samplesMs = await timeStartPage(origin);
  const problems = [
    ...files.problems,
    ...certificate.problems,
    ...findResponseTimeProblems(samplesMs, MONITOR_LIMITS.START_PAGE_MEDIAN_BUDGET_MS),
  ];
  const summary = monitorSummary({
    origin,
    release: files.release,
    commitsBehind: files.commitsBehind,
    daysLeft: certificate.daysLeft,
    samplesMs,
    problems,
  }).join("\n");
  console.log(summary);
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile !== undefined && summaryFile !== "") appendFileSync(summaryFile, `${summary}\n`);
  for (const problem of problems) console.error(`monitor-deployment: ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = await main();
