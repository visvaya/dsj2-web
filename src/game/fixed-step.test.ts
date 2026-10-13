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
    const plan = planSteps(0, 5, 1 / 70, 8);
    expect(plan.steps).toBe(8);
    expect(plan.accumulatorS).toBe(0);
  });

  it("tells how much time it dropped: what had gathered, less the steps it still takes", () => {
    expect(planSteps(0, 5, 0.25, 8).droppedS).toBe(3);
    expect(planSteps(0.5, 2.5, 0.25, 8).droppedS).toBe(1);
    // The remainder under one step is dropped with the backlog, as the accumulator starts again from zero.
    expect(planSteps(0, 2.375, 0.25, 8).droppedS).toBe(0.375);
  });

  it("drops nothing while the steps keep up", () => {
    expect(planSteps(0, 2, 0.25, 8)).toEqual({ steps: 8, accumulatorS: 0, droppedS: 0 });
    expect(planSteps(0, 0.3, 0.25, 8).droppedS).toBe(0);
    expect(planSteps(0, 0, 0.25, 8).droppedS).toBe(0);
  });

  it("ignores negative time", () => {
    expect(planSteps(0.001, -1, 1 / 70)).toEqual({ steps: 0, accumulatorS: 0.001, droppedS: 0 });
  });
});
