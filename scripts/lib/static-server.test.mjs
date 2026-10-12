import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";

import { startStaticServer } from "./static-server.mjs";

const HEADERS = [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/",
  "  Cache-Control: no-cache",
  "/manifest.webmanifest",
  "  Content-Type: application/manifest+json",
  "",
].join("\n");

function makeRelease(parent, name, pageText) {
  const root = join(parent, name);
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "icons"), { recursive: true });
  writeFileSync(join(root, "_headers"), HEADERS);
  writeFileSync(join(root, "index.html"), `<!doctype html><title>${pageText}</title>`);
  writeFileSync(join(root, "assets", "index-AAAAAAAA.js"), `console.log("${pageText}");\n`.repeat(50));
  writeFileSync(join(root, "manifest.webmanifest"), "{}");
  writeFileSync(join(root, "icons", "icon-192.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, "data.bin"), "x");
  return root;
}

let parent;
let rootA;
let rootB;
let server;

before(async () => {
  parent = mkdtempSync(join(tmpdir(), "telemark-static-server-"));
  rootA = makeRelease(parent, "a", "release a");
  rootB = makeRelease(parent, "b", "release b");
  writeFileSync(join(parent, "outside.txt"), "outside the root");
  server = await startStaticServer({ root: rootA });
});

after(async () => {
  await server.close();
  rmSync(parent, { recursive: true, force: true });
});

// Identity encoding unless a test asks otherwise, so bodies and lengths are the stored bytes.
const get = (path, init = {}) =>
  fetch(`${server.origin}${path}`, {
    redirect: "manual",
    ...init,
    headers: { "Accept-Encoding": "identity", ...init.headers },
  });

test("the root serves the page, with the headers of every rule that matches", async () => {
  const response = await get("/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /release a/);
});

test("a query string does not change what is served", async () => {
  const response = await get("/?reset=1");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /release a/);
});

test("the page under its file name redirects to the folder, keeping the query", async () => {
  const response = await get("/index.html?x=1");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/?x=1");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("a hashed file is cached for good, other files get the host's default", async () => {
  const hashed = await get("/assets/index-AAAAAAAA.js");
  assert.equal(hashed.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(hashed.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const icon = await get("/icons/icon-192.png");
  assert.equal(icon.headers.get("content-type"), "image/png");
  assert.equal(icon.headers.get("cache-control"), "public, max-age=0, must-revalidate");
});

test("a content type from the headers file replaces the one from the extension", async () => {
  const response = await get("/manifest.webmanifest");
  assert.equal(response.headers.get("content-type"), "application/manifest+json");
});

test("an unknown path is a real 404 that still carries the headers, never the page", async () => {
  for (const path of ["/missing", "/assets/index-BBBBBBBB.js", "/assets/", "/icons"]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), "", path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  }
});

test("the headers file itself is not served", async () => {
  assert.equal((await get("/_headers")).status, 404);
});

test("nothing outside the root is served", async () => {
  for (const path of ["/..%2Foutside.txt", "/%2e%2e/outside.txt", "/assets/..%2F..%2Foutside.txt"]) {
    assert.equal((await get(path)).status, 404, path);
  }
  assert.equal((await get("/%E0%A4%A")).status, 400);
});

test("only reading methods are allowed", async () => {
  const response = await get("/", { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  const head = await get("/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("text is compressed when the client accepts it, images are not", async () => {
  const script = await get("/assets/index-AAAAAAAA.js", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(script.headers.get("content-encoding"), "gzip");
  assert.equal(script.headers.get("vary"), "Accept-Encoding");
  const plain = await get("/assets/index-AAAAAAAA.js");
  assert.equal(plain.headers.get("content-encoding"), null);
  // fetch has already decoded the compressed body; both give the stored text.
  assert.equal(await script.text(), await plain.text());
  const icon = await get("/icons/icon-192.png", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(icon.headers.get("content-encoding"), null);
});

test("a compressed body really is gzip of the file", async () => {
  // fetch decodes on its own, so the raw bytes are read with a request that hides the encoding from it.
  const { request } = await import("node:http");
  const raw = await new Promise((done, failed) => {
    const outgoing = request(
      `${server.origin}/assets/index-AAAAAAAA.js`,
      { headers: { "Accept-Encoding": "gzip" } },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("end", () => done(Buffer.concat(chunks)));
      },
    );
    outgoing.on("error", failed);
    outgoing.end();
  });
  assert.match(gunzipSync(raw).toString("utf8"), /release a/);
});

test("a known entity tag gets 304 without a body", async () => {
  const first = await get("/assets/index-AAAAAAAA.js");
  const etag = first.headers.get("etag");
  assert.match(etag ?? "", /^"[0-9a-f]{32}"$/);
  const second = await get("/assets/index-AAAAAAAA.js", { headers: { "If-None-Match": etag } });
  assert.equal(second.status, 304);
  assert.equal(await second.text(), "");
});

test("a file can be made missing or damaged, and honest again", async () => {
  const path = "/assets/index-AAAAAAAA.js";
  const honest = await (await get(path)).text();
  server.setFaults([{ path, kind: "missing" }]);
  assert.equal((await get(path)).status, 404);
  server.setFaults([{ path, kind: "corrupt" }]);
  const damaged = await get(path);
  assert.equal(damaged.status, 200);
  assert.equal(await damaged.text(), `${honest} `);
  server.setFaults([]);
  assert.equal(await (await get(path)).text(), honest);
});

test("another release can take over the address, with its own headers file", async () => {
  server.setRoot(rootB);
  assert.match(await (await get("/")).text(), /release b/);
  server.setRoot(rootA);
  assert.match(await (await get("/")).text(), /release a/);
});

test("requests are recorded and announced before they are answered", async () => {
  const seen = [];
  server.onRequest((request) => {
    seen.push(request.path);
    if (request.path === "/manifest.webmanifest") server.setRoot(rootB);
  });
  await get("/manifest.webmanifest");
  const page = await (await get("/")).text();
  server.onRequest(null);
  server.setRoot(rootA);
  assert.deepEqual(seen, ["/manifest.webmanifest", "/"]);
  assert.match(page, /release b/);
  assert.deepEqual(server.requests.at(-1), { method: "GET", path: "/" });
});

test("offline drops every connection, and coming back answers again", async () => {
  server.setOffline(true);
  await assert.rejects(get("/"));
  server.setOffline(false);
  assert.equal((await get("/")).status, 200);
});

test("a root without a headers file is served with the defaults only", async () => {
  const bare = mkdtempSync(join(tmpdir(), "telemark-static-bare-"));
  writeFileSync(join(bare, "page.html"), "<p>bare</p>");
  const other = await startStaticServer({ root: bare });
  try {
    const response = await fetch(`${other.origin}/page.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), null);
    assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  } finally {
    await other.close();
    rmSync(bare, { recursive: true, force: true });
  }
});
