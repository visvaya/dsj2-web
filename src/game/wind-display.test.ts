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
  it("streams a sock along the hill in a strong tail or head wind, as the box's arrow points", () => {
    const [tx, ty] = windSockDirection(withWind(0, 5));
    const [hx, hy] = windSockDirection(withWind(Math.PI, 5));
    expect([tx, ty, hx, hy].map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([1, 0, -1, 0]);
  });

  const around = Array.from({ length: 72 }, (_, i) => (i * Math.PI) / 36);

  it("never lifts a sock above level, whichever way a 4 m/s wind blows", () => {
    const rows = around.map((d) => windSockDirection(withWind(d, 4))[1]);
    // Up the screen only by the foreshortened share pointing away from the viewer, and never far.
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(-0.25);
    expect(Math.min(...rows.filter((_, i) => Math.sin(around[i] ?? 0) <= 1e-9))).toBeGreaterThanOrEqual(0);
  });

  it("shows a sock in a pure cross wind short, neither hanging down nor standing up", () => {
    for (const d of [Math.PI / 2, -Math.PI / 2]) {
      const [ux, uy] = windSockDirection(withWind(d, 4));
      expect(Math.abs(ux)).toBeLessThan(1e-9);
      expect(Math.hypot(ux, uy)).toBeLessThan(0.5);
      expect(Math.abs(uy)).toBeGreaterThan(0);
    }
  });

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
