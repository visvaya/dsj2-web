import { describe, expect, it } from "vitest";
import { iconPicture } from "./icon-picture";

const SIZE_PX = 64;

/** The jumper's suit and helmet are the only blues and purples of the picture. */
function isSuit(rgb: Uint8Array, index: number): boolean {
  const r = rgb[index * 3] ?? 0;
  const g = rgb[index * 3 + 1] ?? 0;
  const b = rgb[index * 3 + 2] ?? 0;
  return b > r + 40 && b > g + 40;
}

describe("iconPicture", () => {
  it("fills a square of the asked size, three bytes a pixel", () => {
    const picture = iconPicture(SIZE_PX);
    expect(picture.sizePx).toBe(SIZE_PX);
    expect(picture.rgb).toHaveLength(SIZE_PX * SIZE_PX * 3);
  });

  it("is the same picture every time", () => {
    expect(iconPicture(SIZE_PX).rgb).toEqual(iconPicture(SIZE_PX).rgb);
  });

  it("has the jumper around its middle, clear of the edges", () => {
    const { rgb } = iconPicture(SIZE_PX);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < SIZE_PX * SIZE_PX; i++) {
      if (!isSuit(rgb, i)) continue;
      xs.push(i % SIZE_PX);
      ys.push(Math.floor(i / SIZE_PX));
    }
    expect(xs.length).toBeGreaterThan(40);
    const middleX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const middleY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(Math.abs(middleX - SIZE_PX / 2)).toBeLessThan(SIZE_PX / 8);
    expect(Math.abs(middleY - SIZE_PX / 2)).toBeLessThan(SIZE_PX / 8);
    expect(Math.min(...xs, ...ys)).toBeGreaterThan(SIZE_PX / 8);
    expect(Math.max(...xs, ...ys)).toBeLessThan((SIZE_PX * 7) / 8);
  });
});
