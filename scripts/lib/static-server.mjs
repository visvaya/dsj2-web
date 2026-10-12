// A static file server that answers the way the game's host does, for the browser tests: the same `_headers`
// file, a real 404 for an unknown path, no fallback to the page. It follows Cloudflare's static assets with
// `html_handling: "auto-trailing-slash"` and `not_found_handling: "none"`, as far as the game uses them:
// "/" serves index.html, "/index.html" redirects to "/", `_headers` itself is never served.
//
// A test can also make it misbehave on purpose (a missing or damaged file, a dead network, another release
// under the same address), which is how the update and failure scenarios of the service worker are played.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

import { headersForPath, parseHeadersFile } from "./headers-rules.mjs";

const HEADERS_FILE = "_headers";
const INDEX_FILE = "index.html";
// What the host sends when `_headers` sets no Cache-Control.
const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const ETAG_LENGTH_CHARS = 32;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const FALLBACK_CONTENT_TYPE = "application/octet-stream";
const COMPRESSIBLE_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".txt"]);

function readRules(root) {
  const file = resolve(root, HEADERS_FILE);
  return existsSync(file) === true ? parseHeadersFile(readFileSync(file, "utf8")) : [];
}

// The file a path names, or null: outside the root, a directory, `_headers`, or nothing at all.
function fileFor(root, pathname) {
  const file = resolve(root, `.${pathname}`);
  if (file.startsWith(root + sep) !== true) return null;
  if (file === resolve(root, HEADERS_FILE)) return null;
  return existsSync(file) === true && statSync(file).isFile() === true ? file : null;
}

function plainAnswer(status, extraHeaders = {}) {
  return { status, headers: { ...extraHeaders }, body: Buffer.alloc(0) };
}

function withCustomHeaders(answer, rules, pathname) {
  const headers = { ...answer.headers };
  for (const header of headersForPath(rules, pathname)) {
    // A header from `_headers` replaces what the host would send by itself.
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === header.name.toLowerCase()) delete headers[name];
    }
    headers[header.name] = header.value;
  }
  return { ...answer, headers };
}

function fileAnswer(file, request, fault) {
  const stored = readFileSync(file);
  // A damaged file: one byte more than the release says, under the same name and type.
  const content = fault?.kind === "corrupt" ? Buffer.concat([stored, Buffer.from(" ")]) : stored;
  const extension = extname(file).toLowerCase();
  const etag = `"${createHash("sha256").update(content).digest("hex").slice(0, ETAG_LENGTH_CHARS)}"`;
  const headers = {
    "Content-Type": CONTENT_TYPES[extension] ?? FALLBACK_CONTENT_TYPE,
    "Cache-Control": DEFAULT_CACHE_CONTROL,
    ETag: etag,
  };
  const known = request.headers["if-none-match"];
  if (known === etag || known === `W/${etag}`) return { status: 304, headers, body: Buffer.alloc(0) };
  const acceptsGzip = /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
  if (acceptsGzip && COMPRESSIBLE_EXTENSIONS.has(extension)) {
    return {
      status: 200,
      headers: { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" },
      body: gzipSync(content),
    };
  }
  return { status: 200, headers, body: content };
}

function answerFor(state, request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return plainAnswer(405, { Allow: "GET, HEAD" });
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return plainAnswer(400);
  }
  if (pathname.endsWith(`/${INDEX_FILE}`)) {
    const folder = pathname.slice(0, -INDEX_FILE.length);
    if (fileFor(state.root, pathname) !== null) return plainAnswer(307, { Location: `${folder}${url.search}` });
    return plainAnswer(404);
  }
  const fault = state.faults.find((candidate) => candidate.path === pathname);
  if (fault?.kind === "missing") return plainAnswer(404);
  const file = fileFor(state.root, pathname.endsWith("/") ? `${pathname}${INDEX_FILE}` : pathname);
  return file === null ? plainAnswer(404) : fileAnswer(file, request, fault);
}

function handle(state, request, response) {
  if (state.offline === true) {
    request.socket.destroy();
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const entry = { method: request.method ?? "", path: url.pathname };
  state.requests.push(entry);
  state.listener?.(entry);
  const answer = withCustomHeaders(answerFor(state, request, url), state.rules, url.pathname);
  response.writeHead(answer.status, { ...answer.headers, "Content-Length": answer.body.length });
  response.end(request.method === "HEAD" ? undefined : answer.body);
}

// Starts a server for the files under `root`. Port 0 picks a free port; `origin` then tells which.
export async function startStaticServer({ root, port = 0, host = "127.0.0.1" }) {
  const state = {
    root: resolve(root),
    rules: readRules(root),
    faults: [],
    offline: false,
    requests: [],
    listener: null,
  };
  const server = createServer((request, response) => handle(state, request, response));
  await new Promise((done, failed) => {
    server.once("error", failed);
    server.listen(port, host, done);
  });
  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;
  return {
    origin: `http://${host}:${boundPort}`,
    port: boundPort,
    requests: state.requests,
    // Another release under the same address, with its own `_headers`.
    setRoot(nextRoot) {
      state.root = resolve(nextRoot);
      state.rules = readRules(nextRoot);
    },
    // [{ path, kind: "missing" | "corrupt" }]; an empty list answers honestly again.
    setFaults(faults) {
      state.faults = [...faults];
    },
    // No answer at all: every connection is dropped, as when the device has no network.
    setOffline(offline) {
      state.offline = offline;
      if (offline === true) server.closeAllConnections();
    },
    // Called with { method, path } before each answer, so a test can change the server between two requests.
    onRequest(listener) {
      state.listener = listener;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((done) => {
        server.close(done);
      });
    },
  };
}
