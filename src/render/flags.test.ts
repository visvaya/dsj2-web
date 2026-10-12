import { describe, expect, it } from "vitest";
import { ORIGINAL_HILL_COUNTRY } from "../game/hill-choice";
import type { FlagPixels } from "./flags";
import { COUNTRY_CODES, COUNTRY_NAME_PL, FLAG_HEIGHT_PX, FLAG_WIDTH_PX, flagPixels, unknownFlagPixels } from "./flags";
import { fnv } from "./test-support/frame-hash";

/** FNV-1a over the colours of every pixel, row by row. */
const pictureHash = (px: FlagPixels): string => fnv(new Uint8ClampedArray(new TextEncoder().encode(px.flat().join())));

/** Recorded from the drawn flags; a change here is a change of a picture. */
// oxfmt-ignore
const FLAG_HASH = {
  AT: "8fedaed3", AU: "8edffda0", BE: "ff529d23", BY: "d92c49cf", CA: "1e2cca28", CH: "b7c6b967", CN: "6eba25d3",
  CZ: "d983168", DE: "c16130cf", DK: "a4ac748f", EE: "30f351c7", ENG: "8b707a0b", FI: "ed012c0f", FR: "6b947ef3",
  HU: "a88567f5", IE: "1d39316b", IS: "f611b02b", IT: "8663de93", JP: "8ed5ef63", KR: "f5906a2a", KZ: "950d4b78",
  LT: "6da45713", LV: "d86072cf", NL: "26a56e25", NO: "7f63a277", PL: "38be343c", RU: "5dcb7110", SE: "82d21ffb",
  SI: "fb496a65", SK: "b7677c02", UA: "6cfe3f7d", US: "29ca8cb5",
} as const;
const UNKNOWN_FLAG_HASH = "e65613e7";

describe("flags", () => {
  it.each(COUNTRY_CODES)("draws %s as a full 15 x 10 grid of colours, with more than one colour", (code) => {
    const px = flagPixels(code);
    expect(px).toHaveLength(FLAG_HEIGHT_PX);
    for (const row of px) {
      expect(row).toHaveLength(FLAG_WIDTH_PX);
      for (const c of row) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(px.flat()).size).toBeGreaterThan(1);
  });

  it.each(COUNTRY_CODES)("keeps every pixel of %s", (code) => {
    expect(pictureHash(flagPixels(code))).toBe(FLAG_HASH[code]);
  });

  it("keeps every pixel of the flag for an unknown country", () => {
    expect(pictureHash(unknownFlagPixels())).toBe(UNKNOWN_FLAG_HASH);
  });

  it("gives every flag a different picture and a Polish name", () => {
    const pictures = new Set(COUNTRY_CODES.map((code) => flagPixels(code).flat().join()));
    expect(pictures.size).toBe(COUNTRY_CODES.length);
    for (const code of COUNTRY_CODES) expect(COUNTRY_NAME_PL[code].length).toBeGreaterThan(0);
  });

  it("knows the country of every original hill", () => {
    expect(ORIGINAL_HILL_COUNTRY).toHaveLength(37);
    expect(new Set(ORIGINAL_HILL_COUNTRY.slice(0, 32)).size).toBe(32);
  });

  it("has a full-size flag for an unknown country, unlike any country's", () => {
    const px = unknownFlagPixels();
    expect(px).toHaveLength(FLAG_HEIGHT_PX);
    for (const row of px) expect(row).toHaveLength(FLAG_WIDTH_PX);
    const picture = px.flat().join();
    for (const code of COUNTRY_CODES) expect(flagPixels(code).flat().join()).not.toBe(picture);
  });
});
