// Writes replay plans as <out-dir>/<name>.json, the form tools/re/craft_replays.py reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writePlanFiles(outDir, files) {
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    writeFileSync(join(outDir, `${file.name}.json`), `${JSON.stringify(file, null, 1)}\n`);
  }
  return `${files.length} plans written to ${outDir}`;
}
