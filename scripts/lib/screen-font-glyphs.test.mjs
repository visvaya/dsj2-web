import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { exportScreenGlyphs, glyphsDigest, SCREEN_FONT_DIGEST_PATH, serializeGlyphs } from "./screen-font-glyphs.mjs";

const committedDigest = () => readFileSync(new URL(`../../${SCREEN_FONT_DIGEST_PATH}`, import.meta.url), "utf8").trim();

test("the committed screens' font was built from the jump picture's glyphs of today", async () => {
  const fresh = glyphsDigest(serializeGlyphs(await exportScreenGlyphs()));
  assert.equal(
    fresh,
    committedDigest(),
    "src/ui/fonts/telemark-screen.woff2 is out of date: run scripts/export-screen-glyphs.mjs and " +
      "tools/font/make_screen_font.py (see the header of tools/font/make_screen_font.py)",
  );
});

test("every exported glyph fills the frame and uses only body, shadow and empty pixels", async () => {
  const { frame, glyphs } = await exportScreenGlyphs();
  assert.ok(glyphs.length > 100);
  for (const { char, rows } of glyphs) {
    assert.equal(rows.length, frame.rows, char);
    for (const row of rows) assert.match(row, new RegExp(`^[#o.]{${frame.width}}$`), char);
  }
});
