import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedResponses,
  findHttpsRedirectProblems,
  findNotServedProblems,
  findReleaseProblems,
  findResponseProblems,
  findStartPageAliasProblems,
  releaseOfWorker,
} from "./deployment-rules.mjs";
import { parseHeadersFile } from "./headers-rules.mjs";
import { contentIdOf, precacheOf, releaseJsonText, renderServiceWorker, sha256Hex } from "./release-rules.mjs";
import { startStaticServer } from "./static-server.mjs";

const HEADERS_TEXT = [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/",
  "  Cache-Control: no-cache",
  "",
].join("\n");
const RULES = parseHeadersFile(HEADERS_TEXT);
const PAGE = "<!doctype html><title>game</title>";
const SCRIPT = "console.log('game');\n".repeat(40);
const FILES = [
  { path: "index.html", sha256: sha256Hex(PAGE) },
  { path: "assets/index-AAAAAAAA.js", sha256: sha256Hex(SCRIPT) },
  { path: "_headers", sha256: sha256Hex(HEADERS_TEXT) },
];
const GOOD_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };

const expectedFor = (url) => expectedResponses(FILES, RULES).find((response) => response.url === url);

test("every file but the headers file is expected at its address, with the headers of its rules", () => {
  const expected = expectedResponses(FILES, RULES);
  assert.deepEqual(
    expected.map((response) => response.url),
    ["/", "/assets/index-AAAAAAAA.js"],
  );
  assert.deepEqual(
    expectedFor("/").headers.map((header) => `${header.name}: ${header.value}`),
    ["X-Content-Type-Options: nosniff", "Referrer-Policy: strict-origin-when-cross-origin", "Cache-Control: no-cache"],
  );
  assert.equal(expectedFor("/").compressed, false);
  assert.equal(expectedFor("/assets/index-AAAAAAAA.js").compressed, true);
});

test("a response that matches has no problems", () => {
  const seen = {
    status: 200,
    sha256: sha256Hex(SCRIPT),
    headers: {
      ...GOOD_HEADERS,
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "text/javascript; charset=utf-8",
      "content-encoding": "br",
    },
  };
  assert.deepEqual(findResponseProblems(expectedFor("/assets/index-AAAAAAAA.js"), seen), []);
});

test("each difference of a response is named", () => {
  const expected = expectedFor("/assets/index-AAAAAAAA.js");
  const good = {
    status: 200,
    sha256: sha256Hex(SCRIPT),
    headers: {
      ...GOOD_HEADERS,
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "application/javascript",
      "content-encoding": "gzip",
    },
  };
  const withHeader = (name, value) => ({ ...good, headers: { ...good.headers, [name]: value } });
  assert.deepEqual(findResponseProblems(expected, { ...good, status: 404 }), [
    "/assets/index-AAAAAAAA.js: HTTP 404, expected 200",
  ]);
  assert.deepEqual(findResponseProblems(expected, { ...good, sha256: sha256Hex(PAGE) }), [
    "/assets/index-AAAAAAAA.js: the body is not the file of the package",
  ]);
  assert.deepEqual(findResponseProblems(expected, withHeader("cache-control", "public, max-age=0, must-revalidate")), [
    '/assets/index-AAAAAAAA.js: Cache-Control is "public, max-age=0, must-revalidate", ' +
      'expected "public, max-age=31536000, immutable"',
  ]);
  assert.deepEqual(findResponseProblems(expected, withHeader("content-type", "text/html; charset=utf-8")), [
    '/assets/index-AAAAAAAA.js: content type "text/html; charset=utf-8" is not the type of the file',
  ]);
  assert.deepEqual(findResponseProblems(expected, withHeader("content-encoding", undefined)), [
    "/assets/index-AAAAAAAA.js: sent without compression",
  ]);
  const withoutSniffGuard = withHeader("x-content-type-options", undefined);
  assert.deepEqual(findResponseProblems(expected, withoutSniffGuard), [
    '/assets/index-AAAAAAAA.js: X-Content-Type-Options is missing, expected "nosniff"',
    "/assets/index-AAAAAAAA.js: x-content-type-options is missing",
  ]);
});

test("an address that must not be served has to be a 404, and never the start page", () => {
  const page = sha256Hex(PAGE);
  assert.deepEqual(findNotServedProblems("/_headers", { status: 404, sha256: sha256Hex("") }, page), []);
  assert.deepEqual(findNotServedProblems("/_headers", { status: 200, sha256: sha256Hex("x") }, page), [
    "/_headers: HTTP 200, expected 404",
  ]);
  assert.deepEqual(findNotServedProblems("/no-such-page", { status: 404, sha256: page }, page), [
    "/no-such-page: answered with the start page",
  ]);
});

test("the start page under its file name redirects to the root", () => {
  assert.deepEqual(findStartPageAliasProblems({ status: 307, headers: { location: "/" } }), []);
  assert.deepEqual(findStartPageAliasProblems({ status: 200, headers: {} }), [
    "/index.html: HTTP 200, expected a redirect to /",
  ]);
  assert.deepEqual(findStartPageAliasProblems({ status: 307, headers: { location: "/home" } }), [
    '/index.html: redirects to "/home"',
  ]);
});

test("plain HTTP redirects to the same address under HTTPS", () => {
  const url = "http://game.example/";
  assert.deepEqual(findHttpsRedirectProblems(url, { status: 301, headers: { location: "https://game.example/" } }), []);
  assert.deepEqual(findHttpsRedirectProblems(url, { status: 200, headers: {} }), [
    "http://game.example/: HTTP 200, expected a redirect to HTTPS",
  ]);
  assert.deepEqual(findHttpsRedirectProblems(url, { status: 301, headers: { location: "https://other.example/" } }), [
    'http://game.example/: redirects to "https://other.example/"',
  ]);
});

test("the served release is compared with the commit and the content expected", () => {
  const text = releaseJsonText({ sourceSha: "a".repeat(40), contentId: "c".repeat(64) });
  assert.deepEqual(findReleaseProblems(text, { sourceSha: "a".repeat(40), contentId: "c".repeat(64) }), []);
  assert.deepEqual(findReleaseProblems(text, { contentId: "c".repeat(64) }), []);
  assert.deepEqual(findReleaseProblems(text, { sourceSha: "b".repeat(40), contentId: "d".repeat(64) }), [
    `/release.json: commit ${"a".repeat(40)}, expected ${"b".repeat(40)}`,
    `/release.json: content ${"c".repeat(64)}, expected ${"d".repeat(64)}`,
  ]);
  assert.deepEqual(findReleaseProblems("<html>", { contentId: "c".repeat(64) }), ["/release.json: not JSON"]);
});

const TEMPLATE = "const RELEASE = self.TELEMARK_RELEASE_PLACEHOLDER;\n\nconst CACHE_NAME = RELEASE.cacheId;\n";

test("the release a worker carries can be read back from its source", () => {
  const precache = precacheOf(FILES);
  const worker = renderServiceWorker(TEMPLATE, { sourceSha: "a".repeat(40), contentId: "c".repeat(64), precache });
  const release = releaseOfWorker(worker);
  assert.equal(release.sourceSha, "a".repeat(40));
  assert.deepEqual(release.precache, precache);
  assert.throws(() => releaseOfWorker("// not a worker of the game"), /carries no release/);
});

// The script itself, against a server that answers like the host.
const SCRIPT_FILE = fileURLToPath(new URL("../check-deployment.mjs", import.meta.url));

function runCheck(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT_FILE, ...args], (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : error.code, stdout, stderr });
    });
  });
}

let parent;
let distDir;
let server;

before(async () => {
  parent = mkdtempSync(join(tmpdir(), "telemark-check-deployment-"));
  distDir = join(parent, "dist");
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), PAGE);
  writeFileSync(join(distDir, "assets", "index-AAAAAAAA.js"), SCRIPT);
  writeFileSync(join(distDir, "_headers"), HEADERS_TEXT);
  const contentId = contentIdOf(FILES, TEMPLATE);
  const releaseJson = releaseJsonText({ sourceSha: "a".repeat(40), contentId });
  writeFileSync(join(distDir, "release.json"), releaseJson);
  const precache = precacheOf([...FILES, { path: "release.json", sha256: sha256Hex(releaseJson) }]);
  writeFileSync(
    join(distDir, "sw.js"),
    renderServiceWorker(TEMPLATE, { sourceSha: "a".repeat(40), contentId, precache }),
  );
  server = await startStaticServer({ root: distDir });
});

after(async () => {
  await server.close();
  rmSync(parent, { recursive: true, force: true });
});

test("the check passes on a server that answers like the host", async () => {
  const result = await runCheck([server.origin, "--dist", distDir]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`serves commit ${"a".repeat(40)}`));
  assert.match(result.stdout, /4 files checked, no problems/);
  assert.match(result.stdout, /note: a missing file under \/assets\/ answers with Cache-Control/);
});

test("the check passes against the release the served worker carries", async () => {
  const result = await runCheck([server.origin, "--served-release", "--source-sha", "a".repeat(40)]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /3 files checked, no problems/);
});

test("the check fails when another commit is expected", async () => {
  const result = await runCheck([server.origin, "--dist", distDir, "--source-sha", "b".repeat(40)]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /release\.json: commit a{40}, expected b{40}/);
});

test("the check fails on a damaged file and on a missing one, naming each", async () => {
  server.setFaults([{ path: "/assets/index-AAAAAAAA.js", kind: "corrupt" }]);
  const damaged = await runCheck([server.origin, "--dist", distDir]);
  server.setFaults([{ path: "/sw.js", kind: "missing" }]);
  const missing = await runCheck([server.origin, "--dist", distDir]);
  server.setFaults([]);
  assert.equal(damaged.code, 1);
  assert.match(damaged.stderr, /\/assets\/index-AAAAAAAA\.js: the body is not the file of the package/);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /\/sw\.js: HTTP 404, expected 200/);
});

test("the check refuses an address that is not the root of a site", async () => {
  for (const address of ["game.example", "https://game.example/some/path"]) {
    const result = await runCheck([address]);
    assert.equal(result.code, 1, address);
    assert.match(result.stderr, /give the address of the game/);
  }
});
