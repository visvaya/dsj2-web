import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { findUnrunTestFiles } from "./test-location-rules.mjs";

test("test files where a runner picks them up pass", () => {
  const files = [
    "src/sim/jump-sim.test.ts",
    "src/storage/test-support/fake-store.test.ts",
    "e2e/smoke.spec.ts",
    "e2e/perf/jump-frames.perf.ts",
    "e2e/releases.setup.ts",
    "scripts/lib/png.test.mjs",
    "scripts/check-x.test.mjs",
    "tools/re/test_tools.py",
    "src/render/__snapshots__/jump-view.pixels.test.ts.snap",
    "src/sim/jump-sim.ts",
    "README.md",
  ];
  assert.deepEqual(findUnrunTestFiles(files), []);
});

test("a file named like a test that no runner picks up is reported", () => {
  const files = [
    "src/ui/menu.test.tsx",
    "src/sim/step.spec.ts",
    "test/helpers.test.ts",
    "e2e/smoke.test.ts",
    "e2e/page.spec.tsx",
    "scripts/lib/png.test.js",
    "scripts/png.spec.mjs",
    "tools/font/test_glyphs.py",
    "tools/re/emulator.test.py",
    "src/sim/notes.test.md",
  ];
  assert.deepEqual(findUnrunTestFiles(files), files);
});

test("the repository has no test file that no runner picks up", () => {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  const files = output.split("\0").filter((path) => path !== "");
  assert.deepEqual(findUnrunTestFiles(files), []);
});
