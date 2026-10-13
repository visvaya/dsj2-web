import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { conflictingHeaders, headersForPath, parseHeadersFile } from "./headers-rules.mjs";

const SAMPLE = [
  "# comment",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/",
  "\tCache-Control: no-cache",
  "  Content-Security-Policy: default-src 'self'; img-src 'self' data:",
].join("\n");

const value = (headers, name) => headers.find((header) => header.name === name)?.value;

test("rules and their headers are read in file order", () => {
  assert.deepEqual(parseHeadersFile(SAMPLE), [
    { pattern: "/*", headers: [{ name: "X-Content-Type-Options", value: "nosniff" }] },
    { pattern: "/assets/*", headers: [{ name: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    {
      pattern: "/",
      headers: [
        { name: "Cache-Control", value: "no-cache" },
        { name: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data:" },
      ],
    },
  ]);
});

test("Windows line endings read the same", () => {
  assert.deepEqual(parseHeadersFile(SAMPLE.replaceAll("\n", "\r\n")), parseHeadersFile(SAMPLE));
});

test("a path gets the headers of every rule that matches it", () => {
  const rules = parseHeadersFile(SAMPLE);
  assert.deepEqual(headersForPath(rules, "/assets/index-abc.js"), [
    { name: "X-Content-Type-Options", value: "nosniff" },
    { name: "Cache-Control", value: "public, max-age=31536000, immutable" },
  ]);
  assert.equal(value(headersForPath(rules, "/"), "Cache-Control"), "no-cache");
  assert.deepEqual(headersForPath(rules, "/sw.js"), [{ name: "X-Content-Type-Options", value: "nosniff" }]);
});

test("a rule without a star matches its path only", () => {
  const rules = parseHeadersFile("/\n  Cache-Control: no-cache\n");
  assert.deepEqual(headersForPath(rules, "/index.html"), []);
  assert.deepEqual(headersForPath(rules, "/assets/"), []);
});

test("a header set by two matching rules is joined with a comma, and reported as a conflict", () => {
  const rules = parseHeadersFile("/*\n  Cache-Control: no-cache\n/assets/*\n  cache-control: immutable\n");
  assert.deepEqual(headersForPath(rules, "/assets/a.js"), [{ name: "Cache-Control", value: "no-cache, immutable" }]);
  assert.deepEqual(conflictingHeaders(rules, "/assets/a.js"), ["cache-control"]);
  assert.deepEqual(conflictingHeaders(rules, "/sw.js"), []);
});

test("syntax outside the supported part of the format is refused with its line", () => {
  const refused = [
    ["https://example.com/*\n  X-A: b\n", /line 1: unsupported rule/],
    ["/a/:name\n  X-A: b\n", /line 1: unsupported rule/],
    ["/a/*/b\n  X-A: b\n", /line 1: unsupported rule/],
    ["/*\n  ! Content-Security-Policy\n", /line 2: removing a header is not supported/],
    ["  X-A: b\n", /line 1: a header before any rule/],
    ["/*\n  no colon here\n", /line 2: expected "Name: value"/],
    ["/*\n  Bad Name: x\n", /line 2: invalid header name/],
    ["/*\n  X-A:\n", /line 2: header "X-A" has no value/],
    ["/*\n  X-A: b\n  x-a: c\n", /line 3: header "x-a" is set twice in one rule/],
    ["/*\n  X-A: b\n/*\n  X-B: c\n", /line 3: rule "\/\*" appears twice/],
    ["/*\n", /rule "\/\*" sets no header/],
    [`/*\n  X-A: ${"a".repeat(2000)}\n`, /line 2: longer than the host allows/],
  ];
  for (const [text, message] of refused) assert.throws(() => parseHeadersFile(text), message);
});

test("more rules than the host allows are refused", () => {
  const text = Array.from({ length: 101 }, (_, index) => `/p${index}\n  X-A: b\n`).join("");
  assert.throws(() => parseHeadersFile(text), /more rules than the host allows/);
});

// The file the game ships with.
const SHIPPED = parseHeadersFile(readFileSync(new URL("../../public/_headers", import.meta.url), "utf8"));
const SHIPPED_PATHS = [
  "/",
  "/index.html",
  "/sw.js",
  "/release.json",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/licenses/silkscreen-ofl.txt",
  "/assets/index-DpkSeCJQ.js",
  "/assets/index-DPSjZmzN.css",
  "/missing",
];

test("the shipped file sets no header twice for any path of the game", () => {
  for (const path of SHIPPED_PATHS) assert.deepEqual(conflictingHeaders(SHIPPED, path), [], path);
});

const cacheControl = (path) => value(headersForPath(SHIPPED, path), "Cache-Control");

test("the shipped file caches hashed files for good and revalidates the rest", () => {
  assert.equal(cacheControl("/assets/index-DpkSeCJQ.js"), "public, max-age=31536000, immutable");
  for (const path of ["/", "/sw.js", "/release.json", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    assert.equal(cacheControl(path), "no-cache", path);
  }
});

test("the shipped file sends the security headers with every response", () => {
  for (const path of SHIPPED_PATHS) {
    const headers = headersForPath(SHIPPED, path);
    assert.equal(value(headers, "X-Content-Type-Options"), "nosniff", path);
    assert.equal(value(headers, "Referrer-Policy"), "strict-origin-when-cross-origin", path);
    assert.match(value(headers, "Permissions-Policy") ?? "", /camera=\(\), microphone=\(\), geolocation=\(\)/, path);
  }
});

test("the shipped policy allows nothing from other origins and no evaluated or inline script", () => {
  const policy = value(headersForPath(SHIPPED, "/"), "Content-Security-Policy") ?? "";
  const directives = new Map(
    policy.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("script-src"), ["'self'"]);
  // The fonts are data: addresses inside the stylesheet; there is no font file to fetch.
  assert.deepEqual(directives.get("font-src"), ["data:"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  for (const [name, sources] of directives) {
    for (const source of sources) {
      assert.match(source, /^(?:'self'|'none'|data:)$/, `${name} ${source}`);
    }
  }
  assert.equal(directives.get("script-src").includes("data:"), false);
});
