import { describe, expect, it } from "vitest";
import { windSockDirection } from "../render/jump-view";
import type { JumpSimState } from "../sim/jump-sim";
import { OWN_HILLS } from "./hill-choice";
import { startTrainingJump, stepTrainingJump } from "./training-session";
import { displayedWindMPerS } from "./wind-display";

function withWind(directionRad: number, speedMPerS: number): JumpSimState {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  const state = startTrainingJump(hill, 1).state;
  return { ...state, wind: { ...state.wind, indicatorDirectionRad: directionRad, speedMPerS } };
}

describe("wind on screen", () => {
  it.each([0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6])(
    "points a sock in a strong wind where the box's arrow points (%s rad)",
    (d) => {
      // The box draws its arrow towards (cos d, sin d / 2) on screen, y down.
      const [ux, uy] = windSockDirection(withWind(d, 5));
      const length = Math.hypot(Math.cos(d), Math.sin(d) / 2);
      expect(ux).toBeCloseTo(Math.cos(d) / length, 6);
      expect(uy).toBeCloseTo(Math.sin(d) / 2 / length, 6);
    },
  );

  it("lets a sock hang down in a calm and lift partly in a light wind", () => {
    expect(windSockDirection(withWind(0, 0))).toEqual([0, 1]);
    const [ux, uy] = windSockDirection(withWind(0, 2));
    expect(ux).toBeGreaterThan(0);
    expect(uy).toBeGreaterThan(0);
  });

  it("drifts the snow by the wind the box shows, frame by frame", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    let jump = startTrainingJump(hill, 5);
    let x = 0;
    let y = 0;
    for (let f = 0; f < 300; f++) {
      const w = displayedWindMPerS(jump.state.wind);
      x += w.x / 70;
      y += w.y / 70;
      jump = stepTrainingJump(jump, { left: f === 69, right: false, dy: 0 });
    }
    expect(jump.windDriftM.x).toBeCloseTo(x, 9);
    expect(jump.windDriftM.y).toBeCloseTo(y, 9);
  });
});
