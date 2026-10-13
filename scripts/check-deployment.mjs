// Checks a deployed game over HTTP: every file of the package is served with the bytes, the type and the
// headers it should have, the release is the expected one, and nothing else is served. The rules live in
// scripts/lib/deployment-rules.mjs.
//
// Usage:
//   node scripts/check-deployment.mjs <url> [--dist <dir>] [--source-sha <commit>] [--wait-s <seconds>]
//       compares the deployment with the package in dist/ (after `pnpm build`); with --wait-s the check is
//       repeated for that long until it passes, because a fresh deployment is not everywhere at once
//   node scripts/check-deployment.mjs <url> --served-release [--source-sha <commit>] [--content-id <id>]
//       checks the deployment against the release its own service worker carries: after a rollback, when the
//       package of the restored release is not at hand, and when the deployed content is already the
//       package's, built from an earlier commit
//
// A plain-HTTP <url> (the local test server) skips the check of the redirect to HTTPS. An address under a
// top-level domain that browsers open only over HTTPS may answer plain HTTP without a redirect; the report says so.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  expectedResponses,
  findHttpsRedirectProblems,
  findNotServedProblems,
  findReleaseProblems,
  findResponseProblems,
  findStartPageAliasProblems,
  notServedUrls,
  plainHttpNote,
  releaseOfWorker,
} from "./lib/deployment-rules.mjs";
import { parseHeadersFile } from "./lib/headers-rules.mjs";
import { RELEASE_FILES } from "./lib/release-rules.mjs";

const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 20_000;

const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() === true ? listFiles(join(dir, entry.name), relative) : [relative];
  });
}

// One request, never following a redirect: { status, headers, sha256, text }.
async function get(url) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "Accept-Encoding": "gzip, br", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    sha256: sha256Hex(body),
    text: body.toString("utf8"),
  };
}

// Waits until the deployment serves the expected release; a change takes a moment to reach the host's edge.
// `expected` is { sourceSha, contentId }, either of which may be undefined.
async function waitForRelease(origin, expected, waitS) {
  const deadline = Date.now() + waitS * 1000;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- one request at a time, until the release shows up
    const seen = await get(`${origin}/${RELEASE_FILES.RELEASE_JSON}`).catch(() => null);
    if (seen !== null && findReleaseProblems(seen.text, expected).length === 0) return;
    if (Date.now() >= deadline) return;
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
}

// Problems common to both modes: what must not be served, the start page's alias, the redirect to HTTPS.
async function commonProblems(origin, startPageSha256) {
  const problems = [];
  for (const url of notServedUrls()) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of requests, in a fixed order for a readable report
    problems.push(...findNotServedProblems(url, await get(`${origin}${url}`), startPageSha256));
  }
  problems.push(...findStartPageAliasProblems(await get(`${origin}/${RELEASE_FILES.START_PAGE}`)));
  if (origin.startsWith("https:") === true) {
    const httpUrl = `${origin.replace(/^https:/, "http:")}/`;
    problems.push(...findHttpsRedirectProblems(httpUrl, await get(httpUrl)));
  }
  return problems;
}

async function checkAgainstPackage(origin, values) {
  const distDir = values.dist;
  const files = listFiles(distDir).map((path) => ({ path, sha256: sha256Hex(readFileSync(join(distDir, path))) }));
  const rules = parseHeadersFile(readFileSync(join(distDir, RELEASE_FILES.HEADERS), "utf8"));
  const local = JSON.parse(readFileSync(join(distDir, RELEASE_FILES.RELEASE_JSON), "utf8"));
  const expectedRelease = { sourceSha: values["source-sha"] ?? local.sourceSha, contentId: local.contentId };

  await waitForRelease(origin, { contentId: local.contentId }, Number(values["wait-s"]));
  const problems = [];
  const expected = expectedResponses(files, rules);
  for (const response of expected) {
    // oxlint-disable-next-line no-await-in-loop -- one request at a time: a check, not a load test
    problems.push(...findResponseProblems(response, await get(`${origin}${response.url}`)));
  }
  const startPageSha256 = files.find((file) => file.path === RELEASE_FILES.START_PAGE)?.sha256 ?? "";
  problems.push(...(await commonProblems(origin, startPageSha256)));
  const served = await get(`${origin}/${RELEASE_FILES.RELEASE_JSON}`);
  problems.push(...findReleaseProblems(served.text, expectedRelease));
  return { problems, checked: expected.length, release: expectedRelease };
}

async function checkAgainstServedRelease(origin, values) {
  const asked = { sourceSha: values["source-sha"], contentId: values["content-id"] };
  await waitForRelease(origin, asked, Number(values["wait-s"]));
  const worker = await get(`${origin}/${RELEASE_FILES.SERVICE_WORKER}`);
  if (worker.status !== 200) return { problems: [`/sw.js: HTTP ${worker.status}, expected 200`], checked: 0 };
  const release = releaseOfWorker(worker.text);
  const expectedRelease = {
    sourceSha: values["source-sha"] ?? release.sourceSha,
    contentId: values["content-id"] ?? release.contentId,
  };
  const problems = [];
  for (const entry of release.precache) {
    const expected = { url: entry.url, sha256: entry.sha256, headers: [], contentType: null, compressed: false };
    // oxlint-disable-next-line no-await-in-loop -- one request at a time: a check, not a load test
    problems.push(...findResponseProblems(expected, await get(`${origin}${entry.url}`)));
  }
  const startPageSha256 = release.precache.find((entry) => entry.url === "/")?.sha256 ?? "";
  problems.push(...(await commonProblems(origin, startPageSha256)));
  const served = await get(`${origin}/${RELEASE_FILES.RELEASE_JSON}`);
  problems.push(...findReleaseProblems(served.text, expectedRelease));
  return { problems, checked: release.precache.length, release: expectedRelease };
}

// What cannot fail the check but belongs in its report.
async function notes(origin) {
  const missingAsset = await get(`${origin}/assets/index-00000000.js`);
  const startPage = await get(`${origin}/`);
  const httpUrl = `${origin.replace(/^https:/, "http:")}/`;
  const plainHttp = origin.startsWith("https:") === true ? [plainHttpNote(httpUrl, await get(httpUrl))] : [];
  return [
    ...plainHttp,
    `a missing file under /assets/ answers with Cache-Control "${missingAsset.headers["cache-control"] ?? "none"}"`,
    `Strict-Transport-Security on the start page: "${startPage.headers["strict-transport-security"] ?? "none"}"`,
  ];
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dist: { type: "string", default: "dist" },
      "source-sha": { type: "string" },
      "content-id": { type: "string" },
      "wait-s": { type: "string", default: "0" },
      "served-release": { type: "boolean", default: false },
    },
  });
  const address = positionals[0];
  if (address === undefined || !/^https?:\/\/[^/]+\/?$/.test(address)) {
    console.error("check-deployment: give the address of the game, for example https://game.example");
    return 1;
  }
  const origin = address.replace(/\/$/, "");
  const deadline = Date.now() + Number(values["wait-s"]) * 1000;
  const check = () => {
    const remaining = { ...values, "wait-s": String(Math.max(0, (deadline - Date.now()) / 1000)) };
    return values["served-release"] === true
      ? checkAgainstServedRelease(origin, remaining)
      : checkAgainstPackage(origin, remaining);
  };
  // A deployment reaches the host's machines one after another: for some seconds one request can be answered
  // from the new release and the next from the one before it. The whole check is repeated until it passes or
  // the wait is over; only what is still wrong then is a problem.
  let result = await check();
  while (result.problems.length > 0 && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- one attempt at a time, until the release has settled
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    result = await check();
  }
  for (const problem of result.problems) console.error(`check-deployment: ${problem}`);
  if (result.problems.length > 0) {
    console.error(`check-deployment: ${result.problems.length} problems at ${origin}`);
    return 1;
  }
  for (const note of await notes(origin)) console.log(`check-deployment: note: ${note}`);
  console.log(
    `check-deployment: ${origin} serves commit ${result.release.sourceSha}, content ${result.release.contentId}; ` +
      `${result.checked} files checked, no problems`,
  );
  return 0;
}

process.exitCode = await main();
