import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  DIST_DIR,
  PROJECT_ROOT,
  RELEASE_A,
  RELEASE_B,
  RELEASES_DIR,
  SINGLE_FILE_DIR,
  SINGLE_FILE_NAME,
  type TestRelease,
} from "./releases/paths";

/** Name of the script in release B: the same code under another content hash, as a real rebuild gives. */
const SCRIPT_B = "index-RELEASEB.js";

function run(script: string, args: readonly string[]): void {
  execFileSync(process.execPath, [join("scripts", script), ...args], { cwd: PROJECT_ROOT, stdio: "pipe" });
}

/** Gives the release another script file and a page that points to it. */
function changeScript(release: TestRelease): void {
  const assets = join(release.dir, "assets");
  const script = readdirSync(assets).find((name) => name.endsWith(".js"));
  if (script === undefined) throw new Error("The build has no script to change");
  const code = readFileSync(join(assets, script), "utf8");
  renameSync(join(assets, script), join(assets, SCRIPT_B));
  writeFileSync(join(assets, SCRIPT_B), `${code}\n// release b\n`);
  const page = join(release.dir, "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replaceAll(script, SCRIPT_B));
}

// Both releases are copies of the build under test, finished by the project's own release step, so the tests
// switch between two packages made exactly as the deployed one is. Neither replaces dist/.
test("prepare two releases and the single-file page", () => {
  rmSync(RELEASES_DIR, { recursive: true, force: true });
  for (const release of [RELEASE_A, RELEASE_B]) cpSync(DIST_DIR, release.dir, { recursive: true });
  changeScript(RELEASE_B);
  for (const release of [RELEASE_A, RELEASE_B]) {
    run("write-release.mjs", ["--dist", release.dir, "--source-sha", release.sourceSha]);
  }
  run("build-single-file.mjs", [join(SINGLE_FILE_DIR, SINGLE_FILE_NAME)]);

  const workerOf = (release: TestRelease): string => readFileSync(join(release.dir, "sw.js"), "utf8");
  expect(workerOf(RELEASE_A)).not.toBe(workerOf(RELEASE_B));
  expect(workerOf(RELEASE_B)).toContain(SCRIPT_B);
  expect(existsSync(join(SINGLE_FILE_DIR, SINGLE_FILE_NAME))).toBe(true);
});
