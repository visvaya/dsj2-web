import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MONITOR_LIMITS,
  certificateDaysLeft,
  findCertificateProblems,
  findResponseTimeProblems,
  medianOf,
  monitorSummary,
  releaseOfAddress,
} from "./monitor-rules.mjs";
import { contentIdOf, precacheOf, releaseJsonText, renderServiceWorker, sha256Hex } from "./release-rules.mjs";
import { startStaticServer } from "./static-server.mjs";

const DAY_MS = 86_400_000;
const NOW_MS = Date.UTC(2026, 9, 13);
const SHA = "a".repeat(40);

test("the release of an address is its commit and content, and only a full commit hash is taken", () => {
  const text = JSON.stringify({ name: "telemark", sourceSha: SHA, contentId: "c".repeat(64) });
  assert.deepEqual(releaseOfAddress(text), { sourceSha: SHA, contentId: "c".repeat(64) });
  assert.throws(() => releaseOfAddress("<!doctype html>"), /not JSON/);
  assert.throws(() => releaseOfAddress("null"), /names no commit/);
  for (const sourceSha of ["master", "--upload-pack=x", SHA.slice(1), `${SHA} `, 7]) {
    assert.throws(() => releaseOfAddress(JSON.stringify({ sourceSha })), /names no commit/, String(sourceSha));
  }
});

test("the release of an address carries its version when it names one, and only a valid one", () => {
  const named = (version) => JSON.stringify({ name: "telemark", version, sourceSha: SHA, contentId: "c".repeat(64) });
  assert.deepEqual(releaseOfAddress(named("0.3.1")), { sourceSha: SHA, contentId: "c".repeat(64), version: "0.3.1" });
  for (const version of ["--upload-pack=x", "0.3", "v0.3.1", 3]) {
    assert.throws(() => releaseOfAddress(named(version)), /names no valid version/, String(version));
  }
});

test("a certificate is a problem when it has ended, has not begun, or ends within the margin", () => {
  const lasting = (daysLeft) => ({ validFromMs: NOW_MS - 30 * DAY_MS, validToMs: NOW_MS + daysLeft * DAY_MS });
  assert.equal(certificateDaysLeft(NOW_MS + 14.5 * DAY_MS, NOW_MS), 14);
  assert.deepEqual(findCertificateProblems(lasting(60), NOW_MS, 14), []);
  assert.deepEqual(findCertificateProblems(lasting(14), NOW_MS, 14), []);
  assert.deepEqual(findCertificateProblems(lasting(13), NOW_MS, 14), [
    "certificate: 13 days left, expected at least 14",
  ]);
  assert.deepEqual(findCertificateProblems(lasting(-1), NOW_MS, 14), ["certificate: expired"]);
  assert.deepEqual(
    findCertificateProblems({ validFromMs: NOW_MS + DAY_MS, validToMs: NOW_MS + 90 * DAY_MS }, NOW_MS, 14),
    ["certificate: not valid yet"],
  );
  assert.deepEqual(findCertificateProblems({ validFromMs: Number.NaN, validToMs: NOW_MS }, NOW_MS, 14), [
    "certificate: its dates cannot be read",
  ]);
});

test("the answer time is judged by the median of the samples", () => {
  assert.equal(medianOf([30, 10, 20]), 20);
  assert.equal(medianOf([40, 10, 20, 30]), 25);
  assert.ok(Number.isNaN(medianOf([])));
  // One slow answer, the first on a new connection for example, is not a slow address.
  assert.deepEqual(findResponseTimeProblems([4000, 90, 80, 100, 85], 1500), []);
  assert.deepEqual(findResponseTimeProblems([1800, 1600.4, 1700], 1500), [
    "start page: median answer 1700 ms, budget 1500 ms",
  ]);
  assert.deepEqual(findResponseTimeProblems([], 1500), ["start page: no answer was timed"]);
});

test("the report names what was measured and leaves out what was not", () => {
  const release = { version: "0.2.0", sourceSha: SHA, contentId: "c".repeat(64) };
  const whole = monitorSummary({
    origin: "https://game.example",
    release,
    commitsBehind: 2,
    daysLeft: 61,
    samplesMs: [120.4, 80, 100],
    problems: [],
  });
  assert.deepEqual(whole, [
    "### Monitor",
    "",
    "- Address: https://game.example",
    "- Served version: 0.2.0",
    `- Served commit: ${SHA}`,
    `- Served content: ${"c".repeat(64)}`,
    "- Commits on the branch after the served one: 2",
    "- Certificate: 61 days left",
    "- Start page: median 100 ms (samples: 120, 80, 100)",
    "- Result: no problems",
  ]);
  const down = monitorSummary({ origin: "https://game.example", samplesMs: [], problems: ["one", "two"] });
  assert.deepEqual(down, [
    "### Monitor",
    "",
    "- Address: https://game.example",
    "- Result: 2 problems",
    "  - one",
    "  - two",
  ]);
  const single = monitorSummary({ origin: "https://game.example", daysLeft: 1, problems: ["one"] });
  assert.deepEqual(single.slice(3), ["- Certificate: 1 day left", "- Result: 1 problem", "  - one"]);
});

test("the limits are positive numbers", () => {
  for (const [name, value] of Object.entries(MONITOR_LIMITS)) assert.ok(value > 0, name);
});

// The script itself, against a server that answers like the host and a repository made for the test.
const SCRIPT_FILE = fileURLToPath(new URL("../monitor-deployment.mjs", import.meta.url));
const TEMPLATE = readFileSync(new URL("service-worker-template.js", import.meta.url), "utf8");
const HEADERS_TEXT = [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "/sw.js",
  "  Cache-Control: no-cache",
  "",
].join("\n");
const PAGE = "<!doctype html><title>game</title>";
const SCRIPT = "console.log('game');\n".repeat(40);
const GIT_IDENTITY = ["-c", "user.name=monitor test", "-c", "user.email=monitor-test@example.invalid"];

let parent;
let repo;
let server;
let earlierSha;
let servedSha;

function git(args) {
  return execFileSync("git", [...GIT_IDENTITY, "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
}

// Writes the package of a release built from `sourceSha` into a new directory and returns the directory.
function writePackage(name, sourceSha) {
  const distDir = join(parent, name);
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), PAGE);
  writeFileSync(join(distDir, "assets", "index-AAAAAAAA.js"), SCRIPT);
  writeFileSync(join(distDir, "_headers"), HEADERS_TEXT);
  const files = [
    { path: "index.html", sha256: sha256Hex(PAGE) },
    { path: "assets/index-AAAAAAAA.js", sha256: sha256Hex(SCRIPT) },
    { path: "_headers", sha256: sha256Hex(HEADERS_TEXT) },
  ];
  const contentId = contentIdOf(files, TEMPLATE, "{}");
  const releaseJson = releaseJsonText({ version: "0.1.0", sourceSha, contentId });
  writeFileSync(join(distDir, "release.json"), releaseJson);
  const precache = precacheOf([...files, { path: "release.json", sha256: sha256Hex(releaseJson) }]);
  writeFileSync(join(distDir, "sw.js"), renderServiceWorker(TEMPLATE, { sourceSha, contentId, precache }));
  return distDir;
}

function runMonitor(args, env = {}) {
  return new Promise((resolve) => {
    const options = { env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...env } };
    execFile(
      process.execPath,
      [SCRIPT_FILE, ...args, "--repo", repo, "--wait-s", "0"],
      options,
      (error, stdout, stderr) => {
        resolve({ code: error === null ? 0 : error.code, stdout, stderr });
      },
    );
  });
}

before(async () => {
  parent = mkdtempSync(join(tmpdir(), "telemark-monitor-test-"));
  repo = join(parent, "repo");
  mkdirSync(join(repo, "public"), { recursive: true });
  git(["init", "--quiet"]);
  writeFileSync(join(repo, "public", "_headers"), HEADERS_TEXT);
  git(["add", "public/_headers"]);
  git(["commit", "--quiet", "-m", "headers"]);
  earlierSha = git(["rev-parse", "HEAD"]).trim();
  git(["commit", "--quiet", "--allow-empty", "-m", "release"]);
  servedSha = git(["rev-parse", "HEAD"]).trim();
  git(["tag", "v0.1.0"]);
  server = await startStaticServer({ root: writePackage("dist", servedSha) });
});

after(async () => {
  await server.close();
  rmSync(parent, { recursive: true, force: true });
});

test("the monitor passes on a release built from a commit of the branch, and reports it", async () => {
  const summaryFile = join(parent, "summary.md");
  const result = await runMonitor([server.origin, "--branch", "HEAD"], { GITHUB_STEP_SUMMARY: summaryFile });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`- Served commit: ${servedSha}`));
  assert.match(result.stdout, /- Commits on the branch after the served one: 0/);
  assert.match(result.stdout, /- Start page: median \d+ ms/);
  assert.match(result.stdout, /- Result: no problems/);
  // The files went through the check of a deployment, under the headers file of the served commit.
  assert.match(result.stdout, /4 files checked, no problems/);
  assert.match(readFileSync(summaryFile, "utf8"), /^### Monitor\n\n- Address: /);
});

test("the monitor fails on a release from a commit that is not on the branch", async () => {
  const result = await runMonitor([server.origin, "--branch", earlierSha]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`commit ${servedSha} is not on ${earlierSha}`));
});

test("the monitor fails when the version of the release has no tag, or a tag on another commit", async () => {
  git(["tag", "--force", "v0.1.0", earlierSha]);
  const moved = await runMonitor([server.origin, "--branch", "HEAD"]);
  git(["tag", "--delete", "v0.1.0"]);
  const missing = await runMonitor([server.origin, "--branch", "HEAD"]);
  git(["tag", "v0.1.0", servedSha]);
  assert.equal(moved.code, 1);
  assert.match(moved.stderr, new RegExp(`the tag v0\\.1\\.0 is on ${earlierSha}, not on ${servedSha}`));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /version 0\.1\.0: there is no tag v0\.1\.0/);
});

test("the monitor fails on a release from a commit the repository does not have", async () => {
  server.setRoot(writePackage("dist-unknown", "b".repeat(40)));
  const result = await runMonitor([server.origin, "--branch", "HEAD"]);
  server.setRoot(join(parent, "dist"));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /commit b{40} is not in the repository/);
});

test("the monitor fails on a damaged file, on a header the commit asks for, and on silence", async () => {
  server.setFaults([{ path: "/assets/index-AAAAAAAA.js", kind: "corrupt" }]);
  const damaged = await runMonitor([server.origin, "--branch", "HEAD"]);
  server.setFaults([]);
  assert.equal(damaged.code, 1);
  assert.match(damaged.stderr, /index-AAAAAAAA\.js: the body is not the file of the package/);
  assert.match(damaged.stderr, /monitor-deployment: the deployed files are not those of the served release/);

  // The served package no longer carries the header its commit sets for the worker.
  const looser = writePackage("dist-looser", servedSha);
  writeFileSync(join(looser, "_headers"), HEADERS_TEXT.replace("/sw.js\n  Cache-Control: no-cache\n", ""));
  server.setRoot(looser);
  const unheaded = await runMonitor([server.origin, "--branch", "HEAD"]);
  server.setRoot(join(parent, "dist"));
  assert.equal(unheaded.code, 1);
  assert.match(unheaded.stderr, /\/sw\.js: Cache-Control is "[^"]+", expected "no-cache"/);

  server.setOffline(true);
  const silent = await runMonitor([server.origin, "--branch", "HEAD"]);
  server.setOffline(false);
  assert.equal(silent.code, 1);
  assert.match(silent.stderr, /the address does not serve a release/);
  assert.match(silent.stderr, /start page: no answer was timed/);
});

test("the monitor refuses an address that is not the root of a site", async () => {
  const result = await runMonitor(["https://game.example/some/path"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /give the address of the game/);
});
