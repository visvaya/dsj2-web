// What the deployed game has to answer, as pure functions: from the package (a listing of dist/ and its
// `_headers` rules) to the responses expected of the host, and from the responses seen to a list of problems.
// The requests themselves are made by scripts/check-deployment.mjs.
//
// A listing entry is { path, sha256 }; a response seen is { status, headers, sha256 }, where `headers` is an
// object with lowercase names and `sha256` is of the decoded body.
import { headersForPath } from "./headers-rules.mjs";
import { RELEASE_FILES, pathOfUrl, urlOfPath } from "./release-rules.mjs";

const CONTENT_TYPE_PATTERNS = [
  [/\.html$/, /^text\/html\b/],
  [/\.js$/, /^(?:text|application)\/javascript\b/],
  [/\.css$/, /^text\/css\b/],
  [/\.webmanifest$/, /^application\/manifest\+json\b/],
  [/\.json$/, /^application\/json\b/],
  [/\.png$/, /^image\/png\b/],
  [/\.txt$/, /^text\/plain\b/],
];
// The bundles are large text, so the host is expected to compress them when asked.
const COMPRESSED_PATH_PATTERN = /^assets\/.*\.(?:js|css)$/;
const COMPRESSION_PATTERN = /^(?:gzip|br|zstd)$/;
// Sent with every response of the game, whatever `_headers` says in detail.
const ALWAYS_EXPECTED_HEADERS = ["x-content-type-options", "referrer-policy"];
const WORKER_RELEASE_PATTERN = /const RELEASE = (\{[\s\S]*?\n\});/;

// The responses expected for the files of the package: [{ url, sha256, headers, contentType, compressed }].
// `_headers` has no address: the host does not serve it (`notServedUrls`).
export function expectedResponses(files, rules) {
  return files
    .filter((file) => file.path !== RELEASE_FILES.HEADERS)
    .map((file) => expectedResponse(file.path, file.sha256, rules));
}

function expectedResponse(path, sha256, rules) {
  const url = urlOfPath(path);
  return {
    url,
    sha256,
    headers: headersForPath(rules, url),
    contentType: CONTENT_TYPE_PATTERNS.find(([pattern]) => pattern.test(path))?.[1] ?? null,
    compressed: COMPRESSED_PATH_PATTERN.test(path),
  };
}

// The same for the addresses a served worker lists ([{ url, sha256 }]), when the package is not at hand but
// the headers file of the commit it was built from is.
export function expectedResponsesOfRelease(precache, rules) {
  return precache.map((entry) => expectedResponse(pathOfUrl(entry.url), entry.sha256, rules));
}

// Addresses that must answer 404: the headers file, the single-file page, and files that do not exist, in the
// places where a host with a fallback to the page would answer with the page.
export function notServedUrls() {
  return ["/_headers", "/telemark.html", "/no-such-page", "/assets/index-00000000.js", "/icons/no-such-icon.png"];
}

function headerProblems(url, expected, seen) {
  return expected.flatMap((header) => {
    const actual = seen[header.name.toLowerCase()];
    if (actual === header.value) return [];
    return [
      `${url}: ${header.name} is ${actual === undefined ? "missing" : `"${actual}"`}, expected "${header.value}"`,
    ];
  });
}

// One message per difference between what a file of the package should answer and what the host answered.
export function findResponseProblems(expected, seen) {
  if (seen.status !== 200) return [`${expected.url}: HTTP ${seen.status}, expected 200`];
  const problems = [];
  if (seen.sha256 !== expected.sha256) problems.push(`${expected.url}: the body is not the file of the package`);
  problems.push(...headerProblems(expected.url, expected.headers, seen.headers));
  for (const name of ALWAYS_EXPECTED_HEADERS) {
    if (seen.headers[name] === undefined) problems.push(`${expected.url}: ${name} is missing`);
  }
  const contentType = seen.headers["content-type"] ?? "";
  if (expected.contentType !== null && expected.contentType.test(contentType) !== true) {
    problems.push(`${expected.url}: content type "${contentType}" is not the type of the file`);
  }
  if (expected.compressed === true && !COMPRESSION_PATTERN.test(seen.headers["content-encoding"] ?? "")) {
    problems.push(`${expected.url}: sent without compression`);
  }
  return problems;
}

// An address that must not be served: a 404, and never the start page under another name.
export function findNotServedProblems(url, seen, startPageSha256) {
  if (seen.status !== 404) return [`${url}: HTTP ${seen.status}, expected 404`];
  return seen.sha256 === startPageSha256 ? [`${url}: answered with the start page`] : [];
}

// The start page under its file name: a redirect to the root, as the host's HTML handling does.
export function findStartPageAliasProblems(seen) {
  if (seen.status < 300 || seen.status > 399) return [`/index.html: HTTP ${seen.status}, expected a redirect to /`];
  return seen.headers["location"] === "/" ? [] : [`/index.html: redirects to "${seen.headers["location"]}"`];
}

// Top-level domains that browsers reach only over HTTPS: the whole domain is on their HSTS preload list, with
// every subdomain. A page under one is never opened over plain HTTP, whatever the host answers there, and a
// workers.dev address has no setting that would make the host redirect.
const HTTPS_ONLY_TOP_LEVEL_DOMAINS = new Set(["dev"]);

export function browsersForceHttps(hostname) {
  return HTTPS_ONLY_TOP_LEVEL_DOMAINS.has(hostname.split(".").at(-1));
}

// The plain-HTTP address: a redirect to the same address under HTTPS, or no redirect at all where browsers
// use HTTPS regardless.
export function findHttpsRedirectProblems(httpUrl, seen) {
  const target = httpUrl.replace(/^http:/, "https:");
  if (seen.status < 300 || seen.status > 399) {
    if (browsersForceHttps(new URL(httpUrl).hostname)) return [];
    return [`${httpUrl}: HTTP ${seen.status}, expected a redirect to HTTPS`];
  }
  return seen.headers["location"] === target ? [] : [`${httpUrl}: redirects to "${seen.headers["location"]}"`];
}

// What the plain-HTTP address answered, for the report.
export function plainHttpNote(httpUrl, seen) {
  const hostname = new URL(httpUrl).hostname;
  const answer = `plain HTTP answers with HTTP ${seen.status}`;
  if (!browsersForceHttps(hostname) || (seen.status >= 300 && seen.status <= 399)) return answer;
  const domain = hostname.split(".").at(-1);
  return `${answer}; browsers use HTTPS for every address under .${domain}, so no page is opened that way`;
}

// release.json as served, against the commit and the content expected.
export function findReleaseProblems(releaseText, { sourceSha, contentId }) {
  let release;
  try {
    release = JSON.parse(releaseText);
  } catch {
    return ["/release.json: not JSON"];
  }
  const problems = [];
  if (sourceSha !== undefined && release.sourceSha !== sourceSha) {
    problems.push(`/release.json: commit ${release.sourceSha}, expected ${sourceSha}`);
  }
  if (contentId !== undefined && release.contentId !== contentId) {
    problems.push(`/release.json: content ${release.contentId}, expected ${contentId}`);
  }
  return problems;
}

// Whether release.json as served names the given content. Anything unreadable does not.
export function servesContent(releaseText, contentId) {
  try {
    return JSON.parse(releaseText).contentId === contentId;
  } catch {
    return false;
  }
}

// The release a served worker carries: { sourceSha, contentId, precache: [{ url, sha256 }], ... }.
// With it a deployment can be checked against itself when the package is not at hand (after a rollback).
export function releaseOfWorker(workerSource) {
  const json = WORKER_RELEASE_PATTERN.exec(workerSource)?.[1];
  if (json === undefined) throw new Error("the served worker carries no release");
  const release = JSON.parse(json);
  if (!Array.isArray(release.precache) || release.precache.length === 0) {
    throw new Error("the served worker keeps no files");
  }
  return release;
}
