import { describe, expect, it } from "vitest";
import { planSteps } from "./fixed-step";

describe("fixed simulation step", () => {
  it("runs 70 steps for one second regardless of the display rate", () => {
    for (const hz of [30, 60, 75, 120, 144]) {
      let acc = 0;
      let total = 0;
      for (let i = 0; i < hz; i++) {
        const plan = planSteps(acc, 1 / hz, 1 / 70);
        acc = plan.accumulatorS;
        total += plan.steps;
      }
      expect(total).toBeGreaterThanOrEqual(69);
      expect(total).toBeLessThanOrEqual(70);
    }
  });

  it("drops the backlog after a long pause", () => {
    expect(planSteps(0, 5, 1 / 70, 8)).toEqual({ steps: 8, accumulatorS: 0 });
  });

  it("ignores negative time", () => {
    expect(planSteps(0.001, -1, 1 / 70)).toEqual({ steps: 0, accumulatorS: 0.001 });
  });
});
