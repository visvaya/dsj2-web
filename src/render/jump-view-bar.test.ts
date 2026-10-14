import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { FrameBuffer } from "./frame-buffer";
import { BAR_HEIGHT_PX, drawBar } from "./jump-view-hud";
import { color } from "./palette";

const hill = OWN_HILLS[0];
const WIDTH_PX = 356;
const HEIGHT_PX = 200;

/** The bar at the foot of the picture, with a name that has every accent above and every ogonek below. */
function barWith(playerName: string): { fb: FrameBuffer; top: number } {
  if (!hill) throw new Error("no hill");
  const fb = new FrameBuffer(WIDTH_PX, HEIGHT_PX);
  const top = HEIGHT_PX - BAR_HEIGHT_PX;
  const model = {
    profile: hill.profile,
    kPointM: hill.kPointM,
    hillName: hill.name,
    playerName,
    state: startTrainingJump(hill, 1).state,
    controls: "mouse" as const,
    frame: 1,
    over: false,
  };
  drawBar(fb, model, top, false);
  return { fb, top };
}

const row = (fb: FrameBuffer, y: number): number[] => Array.from(fb.pixels.subarray(y * fb.width, (y + 1) * fb.width));

describe("the bar of the picture", () => {
  it("holds Polish capitals with their accents and ogonki inside it, under its top line", () => {
    const { fb, top } = barWith("ŚĆŃÓŹŻ ĄĘŁ");
    // Nothing above the bar, and its top line unbroken: an accent would show over the picture.
    for (let y = 0; y < top; y++) expect(row(fb, y).every((p) => p === 0)).toBe(true);
    expect(row(fb, top).every((p) => p === color("grey"))).toBe(true);
    // The name is drawn, down to its lowest row (the ogonki) inside the picture.
    const yellowRows = Array.from({ length: BAR_HEIGHT_PX }, (_, i) => top + i).filter((y) =>
      row(fb, y).includes(color("yellow")),
    );
    expect(yellowRows.length).toBeGreaterThan(0);
    expect(Math.max(...yellowRows)).toBeLessThan(HEIGHT_PX);
    expect(Math.min(...yellowRows)).toBeGreaterThan(top);
  });
});
