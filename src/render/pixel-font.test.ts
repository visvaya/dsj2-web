import { describe, expect, it } from "vitest";
import { FrameBuffer } from "./frame-buffer";
import { drawText, textWidth } from "./pixel-font";

function render(text: string): string[] {
  const fb = new FrameBuffer(64, 14);
  drawText(fb, 1, 3, text, 1);
  const rows: string[] = [];
  for (let y = 0; y < fb.height; y++) {
    let r = "";
    for (let x = 0; x < 7; x++) r += fb.pixels[y * fb.width + x] === 1 ? "#" : ".";
    rows.push(r);
  }
  return rows;
}

describe("pixel font", () => {
  it("draws accents above and ogoneks below the base letter", () => {
    const o = render("O");
    const oAcute = render("Ó");
    expect(oAcute.slice(3, 10)).toEqual(o.slice(3, 10));
    expect(oAcute.slice(1, 3).join("")).toContain("#");
    expect(o.slice(0, 3).join("")).not.toContain("#");
    const e = render("Ę");
    expect(e.slice(10, 12).join("")).toContain("#");
  });

  it("has its own Ł and keeps the width of the base letters", () => {
    expect(render("Ł")).not.toEqual(render("L"));
    expect(textWidth("ŁĄCZĘŻŹŚÓŃ")).toBe(textWidth("LACZEZZSON"));
  });

  it("draws lower-case Polish letters as capitals", () => {
    expect(render("ż")).toEqual(render("Ż"));
  });

  it("has a letter of its own for every Latin Extended capital and its lower-case form", () => {
    const unknown = render("?");
    for (const ch of "ÀÁÂÃÄÅĄĂĆČÇĎĐÈÉÊËĚĘĖĞÌÍÎÏĮĹĽŁŃŇÑÒÓÔÕÖŐØŔŘŚŠŞȘŤŢȚÙÚÛÜŮŰŲÝŸŹŽŻÆ") {
      expect(render(ch), ch).not.toEqual(unknown);
      expect(render(ch.toLowerCase()), ch.toLowerCase()).toEqual(render(ch));
    }
  });

  it("writes the metres after a distance with a small m of its own, and a name's m as a capital", () => {
    expect(render("ｍ")).not.toEqual(render("M"));
    expect(render("m")).toEqual(render("M"));
  });

  it("draws the lower and right edges of its strokes in a darker shade", () => {
    const fb = new FrameBuffer(16, 12);
    const ink = 0xff00c8f0;
    drawText(fb, 1, 1, "H", ink);
    const colours = new Set(fb.pixels.filter((p) => p !== 0));
    expect(colours.has(ink)).toBe(true);
    expect(colours.size).toBe(2);
  });
});
