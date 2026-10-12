import assert from "node:assert/strict";
import { test } from "node:test";

import { decodePng, encodePng, scaleNearest } from "./png.mjs";

// Two by two: red, green on top, blue, white below.
const PICTURE = {
  width: 2,
  height: 2,
  rgb: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]),
};

test("a written picture reads back the same", () => {
  assert.deepEqual(decodePng(encodePng(PICTURE)), PICTURE);
});

test("the file starts with the PNG signature and a header of the picture's size, without transparency", () => {
  const png = encodePng({ width: 3, height: 1, rgb: new Uint8Array(9) });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString("latin1", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 1);
  // Bit depth 8, colour type 2: red, green and blue, no alpha channel.
  assert.deepEqual([png[24], png[25]], [8, 2]);
  assert.equal(png.toString("latin1", png.length - 8, png.length - 4), "IEND");
});

test("pixel data of the wrong length is refused", () => {
  assert.throws(() => encodePng({ width: 2, height: 2, rgb: new Uint8Array(11) }), /does not match the size/);
});

test("a file that is not a PNG, or not of the written kind, is refused", () => {
  assert.throws(() => decodePng(Buffer.from("MZ not a picture")), /not a PNG file/);
  const png = encodePng(PICTURE);
  const withAlpha = Buffer.from(png);
  withAlpha[25] = 6;
  assert.throws(() => decodePng(withAlpha), /only 8-bit RGB/);
});

test("enlarging turns every pixel into a square of one colour", () => {
  const scaled = scaleNearest(PICTURE, 3);
  assert.equal(scaled.width, 6);
  assert.equal(scaled.height, 6);
  const colourAt = (x, y) => [...scaled.rgb.subarray((y * 6 + x) * 3, (y * 6 + x) * 3 + 3)];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const source = (Math.floor(y / 3) * 2 + Math.floor(x / 3)) * 3;
      assert.deepEqual(colourAt(x, y), [...PICTURE.rgb.subarray(source, source + 3)], `${x},${y}`);
    }
  }
});

test("a factor of one copies the picture, and a fraction is refused", () => {
  assert.deepEqual(scaleNearest(PICTURE, 1), PICTURE);
  assert.throws(() => scaleNearest(PICTURE, 2.5), /whole number/);
  assert.throws(() => scaleNearest(PICTURE, 0), /whole number/);
});
