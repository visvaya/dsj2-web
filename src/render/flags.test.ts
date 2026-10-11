import { describe, expect, it } from "vitest";
import { ORIGINAL_HILL_COUNTRY } from "../game/hill-choice";
import { COUNTRY_CODES, COUNTRY_NAME_PL, FLAG_HEIGHT_PX, FLAG_WIDTH_PX, flagPixels, unknownFlagPixels } from "./flags";

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
