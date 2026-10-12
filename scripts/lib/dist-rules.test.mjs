import assert from "node:assert/strict";
import { test } from "node:test";

import { DIST_BUDGETS, findDistProblems, formatDistSummary, sumGzipBytes } from "./dist-rules.mjs";

const TEXT_HEAD = Uint8Array.from([0x3c, 0x21]);
const MZ_HEAD = Uint8Array.from([0x4d, 0x5a]);

function file(path, gzipBytes = 100, head = TEXT_HEAD) {
  return { path, gzipBytes, head };
}

const CLEAN_LISTING = [
  file("index.html"),
  file("telemark.html"),
  file("assets/index-DpkSeCJQ.js", 100_000),
  file("assets/index-DPSjZmzN.css", 8_000),
  file("assets/silkscreen-latin-400-normal-CtPo2yA5.woff2"),
  file("assets/silkscreen-latin-400-normal-D0DfPJut.woff"),
];

test("a clean listing passes", () => {
  assert.deepEqual(findDistProblems(CLEAN_LISTING, DIST_BUDGETS), []);
});

test("an unexpected file is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/notes.txt")], DIST_BUDGETS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not on the allow-list: assets\/notes\.txt/);
});

test("an allowed kind of file outside its place is unexpected", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("extra.js"), file("assets/plain.js")], DIST_BUDGETS);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /extra\.js/);
  assert.match(problems[1], /assets\/plain\.js/);
});

test("a game file in a subdirectory is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/deep/down/hill.rpl")], DIST_BUDGETS);
  assert.ok(problems.some((problem) => /game file extension: assets\/deep\/down\/hill\.rpl/.test(problem)));
});

test("every game file extension is refused in any letter case", () => {
  for (const name of [
    "Dsj.EXE",
    "Dsj.Dat",
    "jump.RPL",
    "jump.Trace",
    "k120.HILLTRACE",
    "dsj.exe",
    "jump.trace.gz",
    "hills.hilltrace.GZ",
  ]) {
    const problems = findDistProblems([...CLEAN_LISTING, file(`assets/${name}`)], DIST_BUDGETS);
    assert.equal(problems.includes(`game file extension: assets/${name}`), true, `${name} was not refused`);
  }
});

test("a compressed file that is not a trace is only unexpected", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/index.js.gz")], DIST_BUDGETS);
  assert.deepEqual(problems, ["not on the allow-list: assets/index.js.gz"]);
});

test("an executable with an innocent name is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/index-AAAAAAAA.js", 2, MZ_HEAD)], DIST_BUDGETS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /MZ executable signature: assets\/index-AAAAAAAA\.js/);
});

test("a file shorter than the signature is not an executable", () => {
  const shortFile = file("assets/index-AAAAAAAA.css", 1, Uint8Array.of(0x4d));
  const problems = findDistProblems([...CLEAN_LISTING, shortFile], DIST_BUDGETS);
  assert.deepEqual(problems, []);
});

test("JavaScript over its budget is reported with the sum", () => {
  const listing = [...CLEAN_LISTING, file("assets/chunk-BBBBBBBB.js", DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)];
  const problems = findDistProblems(listing, DIST_BUDGETS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /JavaScript/);
  assert.ok(problems[0].includes(String(100_000 + DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)));
  assert.ok(problems[0].includes(String(DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)));
});

test("CSS over its budget is reported with the sum", () => {
  const budgets = { JS_GZIP_BUDGET_BYTES: 200_000, CSS_GZIP_BUDGET_BYTES: 7_999 };
  const problems = findDistProblems(CLEAN_LISTING, budgets);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /CSS gzip size 8000 bytes exceeds the budget of 7999 bytes/);
});

test("a sum equal to its budget passes", () => {
  const budgets = { JS_GZIP_BUDGET_BYTES: 100_000, CSS_GZIP_BUDGET_BYTES: 8_000 };
  assert.deepEqual(findDistProblems(CLEAN_LISTING, budgets), []);
});

test("gzip sums count only files of the given extension", () => {
  assert.equal(sumGzipBytes(CLEAN_LISTING, ".js"), 100_000);
  assert.equal(sumGzipBytes(CLEAN_LISTING, ".css"), 8_000);
});

test("the summary gives the file count and both sums against their budgets", () => {
  const budgets = { JS_GZIP_BUDGET_BYTES: 117_500, CSS_GZIP_BUDGET_BYTES: 9_800 };
  assert.equal(
    formatDistSummary(CLEAN_LISTING, budgets),
    "6 files; JavaScript gzip 100000 of 117500 bytes; CSS gzip 8000 of 9800 bytes",
  );
});
