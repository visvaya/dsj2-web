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

/** A sock's angle on the screen for a wind from direction `d` at speed `v`. */
function sockAngle(d: number, v: number): number {
  const [x, y] = windSockDirection(withWind(d, v));
  return Math.atan2(y, x);
}

describe("wind on screen", () => {
  it("streams a sock along the hill in a strong tail or head wind, drooping a little below level", () => {
    const [tx, ty] = windSockDirection(withWind(0, 5));
    const [hx, hy] = windSockDirection(withWind(Math.PI, 5));
    expect([tx > 0.95, hx < -0.95, ty > 0 && ty < 0.25, hy > 0 && hy < 0.25]).toEqual([true, true, true, true]);
  });

  const directions = [...Array.from({ length: 360 }, (_, i) => (i * Math.PI) / 180), Math.PI / 2, -Math.PI / 2];
  const speeds = Array.from({ length: 51 }, (_, i) => i / 10);

  it("never lifts a sock above level and always shows at least a stub, for any wind up to 5 m/s", () => {
    const vectors = speeds.flatMap((v) => directions.map((d) => windSockDirection(withWind(d, v))));
    const lengths = vectors.map(([x, y]) => Math.hypot(x, y));
    expect(Math.min(...vectors.map(([, y]) => y))).toBeGreaterThan(0);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("turns a sock smoothly as the wind turns, so its width never swings across", () => {
    // The sock's angle on the screen between directions one degree apart, at every speed.
    const steps = speeds.flatMap((v) =>
      directions.slice(0, 360).map((d) => Math.abs(sockAngle(d + Math.PI / 180, v) - sockAngle(d, v))),
    );
    expect(Math.max(...steps)).toBeLessThan(0.2);
  });

  it("shows a sock in a pure cross wind short, neither hanging straight down nor standing up", () => {
    const shapes = [Math.PI / 2, -Math.PI / 2].map((d) => windSockDirection(withWind(d, 4)));
    expect(shapes.map(([x, y]) => [Math.abs(x) < 1e-9, y > 0, Math.hypot(x, y) < 0.7])).toEqual([
      [true, true, true],
      [true, true, true],
    ]);
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
