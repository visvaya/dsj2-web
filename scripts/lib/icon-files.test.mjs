import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ICON_FILES, renderIcons } from "./icon-files.mjs";
import { decodePng } from "./png.mjs";

const PUBLIC_URL = new URL("../../public/", import.meta.url);
const readPublic = (path) => readFileSync(new URL(path, PUBLIC_URL));
const MANIFEST = JSON.parse(readPublic("manifest.webmanifest").toString("utf8"));
const PAGE = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

// The share of the icon's side, measured from its centre, that every launcher shows of a maskable icon.
const MASK_SAFE_RADIUS_SHARE = 0.4;
// The jumper's suit and helmet are the only blues and purples of the picture. The skis share their browns
// with the tree trunks, so they are not looked for; they end well inside the suit's distance from the centre.
const isFigureColour = ([r, g, b]) => b > r + 40 && b > g + 40;

test("every icon is a whole enlargement of the game's picture", () => {
  for (const icon of ICON_FILES) {
    assert.equal(Number.isInteger(icon.sizePx / icon.pictureSizePx), true, icon.path);
  }
});

// The pixels are compared, not the bytes of the files: the same pixels may compress to other bytes in
// another version of the runtime.
test("the committed icons are what the generator draws today", async () => {
  for (const icon of await renderIcons()) {
    const committed = decodePng(readPublic(icon.path));
    assert.equal(committed.width, icon.sizePx, icon.path);
    assert.equal(committed.height, icon.sizePx, icon.path);
    assert.equal(
      Buffer.from(committed.rgb).equals(Buffer.from(icon.rgb)),
      true,
      `${icon.path} is out of date: run \`node scripts/make-icons.mjs\``,
    );
  }
});

test("the figure stays inside the circle a launcher may cut a maskable icon to", () => {
  const { width, rgb } = decodePng(readPublic("icons/icon-maskable-512.png"));
  const centre = (width - 1) / 2;
  let figurePixels = 0;
  let outside = 0;
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFigureColour(rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3))) continue;
      figurePixels += 1;
      if (Math.hypot(x - centre, y - centre) > MASK_SAFE_RADIUS_SHARE * width) outside += 1;
    }
  }
  assert.ok(figurePixels > 0.01 * width * width, "the figure is in the picture");
  assert.equal(outside, 0);
});

test("the manifest starts the game at the root of its address and does not force an orientation", () => {
  assert.deepEqual(
    { id: MANIFEST.id, start_url: MANIFEST.start_url, scope: MANIFEST.scope },
    { id: "/", start_url: "/", scope: "/" },
  );
  assert.equal(MANIFEST.name, "Telemark");
  assert.equal(MANIFEST.short_name, "Telemark");
  assert.equal(MANIFEST.lang, "pl");
  assert.equal(MANIFEST.display, "fullscreen");
  assert.equal(MANIFEST.background_color, "#000000");
  assert.equal(MANIFEST.theme_color, "#000000");
  assert.equal("orientation" in MANIFEST, false);
});

test("the manifest's icons exist with the size and kind it states", () => {
  assert.deepEqual(MANIFEST.icons.map((icon) => `${icon.sizes} ${icon.purpose}`).toSorted(), [
    "192x192 any",
    "512x512 any",
    "512x512 maskable",
  ]);
  for (const icon of MANIFEST.icons) {
    assert.equal(icon.type, "image/png", icon.src);
    const { width, height } = decodePng(readPublic(icon.src.slice(1)));
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
    assert.ok(
      ICON_FILES.some((file) => `/${file.path}` === icon.src),
      icon.src,
    );
  }
});

test("the page links the manifest and an icon for the home screen of the size iOS asks for", () => {
  assert.match(PAGE, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(PAGE, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png" \/>/);
  const { width, height } = decodePng(readPublic("icons/apple-touch-icon.png"));
  assert.deepEqual([width, height], [180, 180]);
});
