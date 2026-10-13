import { fileURLToPath } from "node:url";

/**
 * The releases the offline and update tests switch between, prepared once from the build under test
 * (e2e/releases.setup.ts) in a directory git ignores. Two releases differ in their script, their page and
 * the commit they claim, so their service workers differ too.
 */
export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DIST_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));
export const RELEASES_DIR = fileURLToPath(new URL("../.pwa-releases/", import.meta.url));

export interface TestRelease {
  dir: string;
  /** The commit the release says it was built from. */
  sourceSha: string;
}

export const RELEASE_A: TestRelease = {
  dir: fileURLToPath(new URL("../.pwa-releases/a/", import.meta.url)),
  sourceSha: "a".repeat(40),
};
export const RELEASE_B: TestRelease = {
  dir: fileURLToPath(new URL("../.pwa-releases/b/", import.meta.url)),
  sourceSha: "b".repeat(40),
};

/** The game packed into one page (scripts/build-single-file.mjs), in a directory of its own. */
export const SINGLE_FILE_DIR = fileURLToPath(new URL("../.pwa-releases/single/", import.meta.url));
export const SINGLE_FILE_NAME = "telemark.html";
