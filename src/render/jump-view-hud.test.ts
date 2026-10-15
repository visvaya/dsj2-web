import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer } from "./frame-buffer";
import { drawStartLight, drawWindBox } from "./jump-view-hud";
import { hudColour } from "./scene-palette";

const WIDTH_PX = 356;
const HEIGHT_PX = 200;

function gateState(): JumpSimState {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  return startTrainingJump(hill, 1).state;
}

function withLogic(s: JumpSimState, logic: Partial<JumpSimState["logic"]>): JumpSimState {
  return { ...s, logic: { ...s.logic, ...logic } };
}

/** Pixels of a colour in a rectangle of the picture. */
function count(fb: FrameBuffer, colour: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (fb.pixels[y * fb.width + x] === colour) n++;
  }
  return n;
}

describe("the start light", () => {
  // Left of the wind box: 16 columns, the red lamp in rows 5..14, the green one in rows 17..26.
  const left = WIDTH_PX - 4 - 29 - 4 - 16;
  const lit = (s: JumpSimState) => {
    const fb = new FrameBuffer(WIDTH_PX, HEIGHT_PX);
    drawStartLight(fb, s);
    const red = count(fb, hudColour(0x48), left, 5, left + 16, 15) > 0;
    const green = count(fb, hudColour(0x56), left, 17, left + 16, 27) > 0;
    const shown = count(fb, hudColour(0x08), left, 3, left + 16, 29) > 0;
    return { red, green, shown };
  };

  it("is red before the countdown starts and green once it runs", () => {
    const s = gateState();
    expect(lit(withLogic(s, { frame: 10, startCountdown: 16 }))).toEqual({ red: true, green: false, shown: true });
    expect(lit(withLogic(s, { frame: 40, startCountdown: 15 }))).toEqual({ red: false, green: true, shown: true });
  });

  it("blinks green in the last ten seconds and turns red when the time is up", () => {
    const s = gateState();
    expect(lit(withLogic(s, { frame: 70 * 10 + 10, startCountdown: 10 })).green).toBe(true);
    expect(lit(withLogic(s, { frame: 70 * 10 + 30, startCountdown: 10 })).green).toBe(false);
    expect(lit(withLogic(s, { frame: 1200, startCountdown: -1 }))).toEqual({ red: true, green: false, shown: true });
  });

  it("is gone once the jumper starts", () => {
    const s = gateState();
    expect(lit(withLogic(s, { frame: 90, startCountdown: 14, phase: PHASE.inrun })).shown).toBe(false);
  });
});

describe("the wind box", () => {
  it("draws the arrow as the original does: a positive cross component points down the screen", () => {
    const s = gateState();
    const fb = new FrameBuffer(WIDTH_PX, HEIGHT_PX);
    // Karpacz at frame 10 of its replay: the original's arrow points down and to the left.
    drawWindBox(fb, { ...s, wind: { ...s.wind, indicatorDirectionRad: 2.306, speedMPerS: 1.2 } });
    const cx = WIDTH_PX - 4 - 29 + 13;
    const cy = 3 + 8;
    const arrow = hudColour(0x47);
    const lowerLeft = count(fb, arrow, cx - 12, cy + 2, cx - 4, cy + 8);
    const upperLeft = count(fb, arrow, cx - 12, cy - 8, cx - 4, cy - 2);
    expect(lowerLeft).toBeGreaterThan(0);
    expect(upperLeft).toBe(0);
  });
});
