import { describe, expect, it } from "vitest";
import { FrameBuffer } from "./frame-buffer";
import { drawText, fontCharacters, GLYPH_FRAME, glyphPixels, textWidth } from "./pixel-font";
import { hudColour } from "./scene-palette";

const INK = 0xff00c8f0;
/** A character the font has no glyph for. */
const UNKNOWN = "~";

/** One character drawn at (1, 3) in a flat colour: `#` body, `o` shadow, `.` empty. */
function render(text: string): string[] {
  const fb = new FrameBuffer(64, 14);
  drawText(fb, 1, 3, text, INK);
  const rows: string[] = [];
  for (let y = 0; y < fb.height; y++) {
    let r = "";
    for (let x = 0; x < 7; x++) {
      const p = fb.pixels[y * fb.width + x];
      r += p === INK ? "#" : p === 0 ? "." : "o";
    }
    rows.push(r);
  }
  return rows;
}

const LATIN_EXTENDED = "ÀÁÂÃÄÅĄĂĆČÇĎĐÈÉÊËĚĘĖĞÌÍÎÏİĮĹĽŁŃŇÑÒÓÔÕÖŐØŔŘŚŠŞȘŤŢȚÙÚÛÜŮŰŲÝŸŹŽŻÆ";
const SIGNS = ".,:;/+-=!()'\"%·";

describe("pixel font", () => {
  it("draws a body six rows tall with its shadow one row down under it", () => {
    const h = render("H");
    expect(h.slice(3, 9).every((r) => r.includes("#"))).toBe(true);
    expect(h[9]).toBe(".oo.oo.");
    expect(h.slice(0, 3).join("") + h.slice(10).join("")).not.toMatch(/[#o]/);
    // The shadow falls into counters and inner corners too: under the cross bar of H.
    expect(h[7]).toBe(".##o##.");
  });

  it("gives every character the same advance", () => {
    expect(textWidth("I")).toBe(5);
    expect(textWidth("MI.1")).toBe(4 * 6 - 1);
    expect(textWidth("ŁĄCZĘŻŹŚÓŃ")).toBe(textWidth("LACZEZZSON"));
    const fb = new FrameBuffer(64, 14);
    expect(drawText(fb, 2, 3, "AB", INK)).toBe(2 + 2 * 6);
  });

  it("draws accents in two rows above and ogoneks below the base letter", () => {
    const o = render("O");
    const oAcute = render("Ó");
    expect(oAcute.slice(4, 10)).toEqual(o.slice(4, 10));
    expect(oAcute.slice(1, 3).join("")).toContain("#");
    const e = render("Ę");
    expect(e.slice(3, 9)).toEqual(render("E").slice(3, 9));
    expect(e.slice(10, 12).join("")).toContain("#");
  });

  it("has a glyph of its own for every Latin Extended capital, the same for its lower-case form", () => {
    const unknown = render(UNKNOWN).join("|");
    const seen = new Set<string>();
    for (const ch of `${LATIN_EXTENDED}ß`) {
      const g = render(ch).join("|");
      expect(g).not.toBe(unknown);
      expect(seen.has(g)).toBe(false);
      seen.add(g);
      expect(render(ch.toLowerCase())).toEqual(render(ch));
    }
    expect(render("Ł")).not.toEqual(render("L"));
  });

  it("has a glyph for every letter, digit and sign, lower-case letters drawn as capitals", () => {
    const unknown = render(UNKNOWN).join("|");
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" + SIGNS) {
      expect(render(ch).join("|")).not.toBe(unknown);
    }
    for (const ch of "abcdefghijklmnopqrstuvwxyz") expect(render(ch)).toEqual(render(ch.toUpperCase()));
    expect(render(" ").join("")).not.toMatch(/[#o]/);
  });

  it("draws a lower-case dotted I as İ and other combining marks as nothing", () => {
    expect(render("i̇")).toEqual(render("İ"));
    expect(render("Ó")).toEqual(render("O"));
    expect(textWidth("i̇x")).toBe(textWidth("IX"));
  });

  it("tells O from 0", () => {
    expect(render("O")).not.toEqual(render("0"));
  });

  it("keeps a row between the dots, the acute or the dot above and the letter", () => {
    for (const ch of "ÄÖÜŚĆŻ") expect(render(ch)[2]).not.toContain("#");
  });

  it("writes the metres after a distance with a small m of its own, and a name's m as a capital", () => {
    expect(render("ｍ")).not.toEqual(render("M"));
    expect(render("m")).toEqual(render("M"));
  });

  it("colours a flat ink's shadow in a darker tone of it", () => {
    const fb = new FrameBuffer(16, 12);
    drawText(fb, 1, 1, "H", INK);
    const colours = new Set(fb.pixels.filter((p) => p !== 0));
    expect(colours.size).toBe(2);
    expect(colours.has(INK)).toBe(true);
  });

  it("colours a ramp as the original: body one step down, shadow six, lighter towards the lower right", () => {
    const fb = new FrameBuffer(16, 12);
    const ramp = 0x79;
    drawText(fb, 0, 0, "H", { ramp });
    const at = (x: number, y: number) => fb.pixels[y * fb.width + x];
    // Row r and column c of the rule count from 1: index = ramp - steps + (2r + c) div 6.
    expect(at(0, 0)).toBe(hudColour(ramp - 1));
    expect(at(4, 5)).toBe(hudColour(ramp - 1 + 2));
    expect(at(0, 6)).toBe(hudColour(ramp - 6 + 2));
    expect(at(2, 4)).toBe(hudColour(ramp - 6 + 2));
  });

  it("puts a one-pixel drop shadow under and right of the letter when asked", () => {
    const fb = new FrameBuffer(16, 12);
    const shadow = 0xff000000;
    drawText(fb, 1, 1, "I", INK, shadow);
    expect(fb.pixels[8 * fb.width + 2]).toBe(shadow);
    expect(fb.pixels[1 * fb.width + 1]).toBe(INK);
  });
});

/** A character as `render` draws it, cut to the frame `glyphPixels` gives it in. */
const inFrame = (text: string) =>
  render(text)
    .slice(1, 1 + GLYPH_FRAME.rows)
    .map((r) => r.slice(1, 6));

describe("pixel font for other fonts", () => {
  it.each(["H", "Ą", "Ś", "ß", "ｍ", "?"])("gives the pixels of %s in the frame as the picture draws them", (ch) => {
    expect(glyphPixels(ch)).toEqual(inFrame(ch));
  });

  it("gives a lower-case letter the capital's pixels", () => {
    expect(glyphPixels("ś")).toEqual(glyphPixels("Ś"));
  });

  it("lists every character with a glyph of its own, the Polish capitals among them", () => {
    const chars = fontCharacters();
    expect(new Set(chars).size).toBe(chars.length);
    for (const ch of "AZ09ĄĆĘŁŃÓŚŹŻ.?·") expect(chars).toContain(ch);
    expect(chars.every((ch) => glyphPixels(ch).length === GLYPH_FRAME.rows)).toBe(true);
  });
});
