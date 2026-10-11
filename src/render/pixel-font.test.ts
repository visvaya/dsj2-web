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
});
