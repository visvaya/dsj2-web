// Service worker of the game: keeps one complete release, so the game starts without a network.
//
// This file is the worker's source. The release step (scripts/write-release.mjs) writes the release into the
// placeholder below and saves the result as sw.js; nothing else is changed.
//
// How a release replaces another:
// - install fetches every file of the release, checks each against its SHA-256 and only then stores them, in a
//   cache of its own. One file that is missing, different or redirected fails the whole install and leaves no
//   part of the release behind; the worker that was active before keeps serving its own release.
// - the new worker then waits. It never takes over a page that an older worker serves (no skipWaiting, no
//   clients.claim): a page always gets its document and its scripts from one release, and a jump is never
//   interrupted. The browser activates the new worker once every window of the game is closed.
// - activate removes the caches of other releases. Only caches with this game's prefix are touched; the
//   player's records and files live in localStorage and IndexedDB, which the worker never reads or writes.
const RELEASE = self.TELEMARK_RELEASE_PLACEHOLDER;

const CACHE_NAME = `${RELEASE.cachePrefix}${RELEASE.cacheId}`;
const START_URL = "/";
// The start page under its file name too: the host redirects it to the root, the worker answers both alike.
const START_PATHS = new Set(["/", "/index.html"]);
const KEPT_URLS = new Set(RELEASE.precache.map((entry) => entry.url));
const RELEASE_MESSAGE = "telemark:release";
// Left out of a stored copy: the body is kept decoded, so these would describe bytes that are not there.
const TRANSPORT_HEADERS = ["content-encoding", "content-length", "vary"];

async function sha256Hex(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One file of the release, as it will be stored, or an error that names what was wrong with it.
async function fetchVerified(entry) {
  // "no-cache": the browser's own cache may answer only after asking the server. "error": a redirect is not
  // the file, wherever it leads.
  const response = await fetch(new URL(entry.url, self.location.origin), {
    cache: "no-cache",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${entry.url}: HTTP ${response.status}`);
  if (response.type !== "basic") throw new Error(`${entry.url}: not a same-origin response`);
  const body = await response.arrayBuffer();
  if ((await sha256Hex(body)) !== entry.sha256) throw new Error(`${entry.url}: not the file of this release`);
  const headers = new Headers(response.headers);
  for (const name of TRANSPORT_HEADERS) headers.delete(name);
  return new Response(body, { status: 200, headers });
}

async function isComplete() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  const found = await Promise.all(RELEASE.precache.map((entry) => cache.match(entry.url)));
  return found.every((response) => response !== undefined);
}

async function install() {
  // The same release installed again (after a rollback, or a retry): what is complete is left alone.
  if ((await isComplete()) === true) return;
  try {
    const responses = await Promise.all(RELEASE.precache.map(fetchVerified));
    // Stored only after every file has arrived and matched.
    const cache = await caches.open(CACHE_NAME);
    for (const [index, entry] of RELEASE.precache.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- one write at a time, so a full disk fails at one known file
      await cache.put(entry.url, responses[index]);
    }
    // Another worker of the game, activated meanwhile, removes every cache but its own.
    if ((await isComplete()) !== true) throw new Error("the stored release was removed while it was written");
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

async function activate() {
  const names = await caches.keys();
  const outdated = names.filter((name) => name.startsWith(RELEASE.cachePrefix) && name !== CACHE_NAME);
  await Promise.all(outdated.map((name) => caches.delete(name)));
}

// The kept address that answers a request, or null when the request is not the worker's business: another
// origin, another method, a path the release does not have. Query strings are ignored, so they make no copies.
function keptUrlFor(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (request.mode === "navigate" && START_PATHS.has(url.pathname)) return START_URL;
  return KEPT_URLS.has(url.pathname) ? url.pathname : null;
}

async function respond(keptUrl, request) {
  const kept = await caches.match(keptUrl, { cacheName: CACHE_NAME, ignoreSearch: true, ignoreVary: true });
  // The browser may drop a cache when the device runs out of room; the game then needs the network again.
  return kept ?? fetch(request);
}

async function describeRelease() {
  return {
    type: RELEASE_MESSAGE,
    sourceSha: RELEASE.sourceSha,
    contentId: RELEASE.contentId,
    complete: await isComplete(),
  };
}

self.addEventListener("install", (event) => {
  event.waitUntil(install());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
  const keptUrl = keptUrlFor(event.request);
  if (keptUrl === null) return;
  event.respondWith(respond(keptUrl, event.request));
});

// A page asks which release this worker holds and whether all of it is stored.
self.addEventListener("message", (event) => {
  const port = event.ports.at(0);
  if (port === undefined || event.data?.type !== RELEASE_MESSAGE) return;
  event.waitUntil(
    describeRelease().then((description) => {
      port.postMessage(description);
    }),
  );
});
