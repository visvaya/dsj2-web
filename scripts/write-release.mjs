// Finishes the production build in dist/: adds the font licence, release.json (with the version from
// package.json) and the service worker, and writes the checksums of the whole package next to it. The rules
// live in scripts/lib/release-rules.mjs.
//
// Usage: node scripts/write-release.mjs [--dist <dir>] [--source-sha <commit>] [--checksums <file>]
//   (run after `vite build`; `pnpm build` does both)
//
// The commit comes from --source-sha, else from GITHUB_SHA, else from the checked-out HEAD. Nothing here
// depends on the time of the run: the same source gives the same files.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  RELEASE_FILES,
  checksumText,
  contentIdOf,
  precacheOf,
  releaseJsonText,
  renderServiceWorker,
  sha256Hex,
} from "./lib/release-rules.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_TEMPLATE_FILE = join(PROJECT_ROOT, "scripts", "lib", "service-worker-template.js");
// The fonts are distributed inside the stylesheet, so their licence goes out with them.
const FONT_LICENCE_SOURCE = join(PROJECT_ROOT, "src", "ui", "fonts", "OFL.txt");
const FONT_LICENCE_PATH = "licenses/silkscreen-ofl.txt";
// How the host answers for the files: a change here is a change of the deployed game, with the same files.
const HOST_CONFIGURATION_FILE = join(PROJECT_ROOT, "deploy", "wrangler.jsonc");

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() === true ? listFiles(join(dir, entry.name), relative) : [relative];
  });
}

function describeFiles(distDir) {
  return listFiles(distDir).map((path) => ({ path, sha256: sha256Hex(readFileSync(join(distDir, path))) }));
}

function sourceShaFrom(option) {
  if (option !== undefined) return option;
  const fromCi = process.env["GITHUB_SHA"];
  if (fromCi !== undefined && fromCi !== "") return fromCi;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    throw new Error("cannot tell which commit is being built: pass --source-sha <commit>");
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      dist: { type: "string", default: "dist" },
      "source-sha": { type: "string" },
      checksums: { type: "string" },
    },
  });
  const distDir = resolve(values.dist);
  if (existsSync(join(distDir, RELEASE_FILES.START_PAGE)) !== true) {
    console.error(
      `write-release: ${values.dist}/${RELEASE_FILES.START_PAGE} does not exist; run \`vite build\` first.`,
    );
    return 1;
  }
  const sourceSha = sourceShaFrom(values["source-sha"]);
  const checksumsFile = resolve(values.checksums ?? join(dirname(distDir), `${basename(distDir)}.sha256`));

  // Left over from an earlier run on the same directory; the bundler's own output is the only input.
  for (const generated of [RELEASE_FILES.RELEASE_JSON, RELEASE_FILES.SERVICE_WORKER]) {
    rmSync(join(distDir, generated), { force: true });
  }
  mkdirSync(dirname(join(distDir, FONT_LICENCE_PATH)), { recursive: true });
  copyFileSync(FONT_LICENCE_SOURCE, join(distDir, FONT_LICENCE_PATH));

  const template = readFileSync(WORKER_TEMPLATE_FILE, "utf8");
  const contentId = contentIdOf(describeFiles(distDir), template, readFileSync(HOST_CONFIGURATION_FILE, "utf8"));
  const { version } = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
  writeFileSync(join(distDir, RELEASE_FILES.RELEASE_JSON), releaseJsonText({ version, sourceSha, contentId }));

  const precache = precacheOf(describeFiles(distDir));
  writeFileSync(
    join(distDir, RELEASE_FILES.SERVICE_WORKER),
    renderServiceWorker(template, { sourceSha, contentId, precache }),
  );

  const files = describeFiles(distDir);
  writeFileSync(checksumsFile, checksumText(files, basename(distDir)));
  console.log(
    `write-release: ${files.length} files, ${precache.length} kept offline; version ${version}; commit ${sourceSha}; content ${contentId}`,
  );
  return 0;
}

process.exitCode = main();
