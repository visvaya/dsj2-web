// Draws the icons of the installable game into public/icons/ from the game's own picture.
// Usage: node scripts/make-icons.mjs  (run after a change to the picture; the files are committed)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderIcons } from "./lib/icon-files.mjs";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

for (const icon of await renderIcons()) {
  const file = join(PUBLIC_DIR, icon.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, icon.png);
  console.log(`${icon.path}: ${icon.sizePx} by ${icon.sizePx} pixels, ${icon.png.length} bytes`);
}
