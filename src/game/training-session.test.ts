import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "./hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "./training-session";

const hill = OWN_HILLS[0];

describe("training jump", () => {
  it("is fully determined by the seed and the inputs", () => {
    if (!hill) throw new Error("no hill");
    const run = () => {
      const jump = startTrainingJump(hill, 12345);
      for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
        const frame = jump.state.logic.frame + 1;
        stepTrainingJump(jump, { left: frame === 70 || (frame > 500 && frame < 520), right: frame > 500 && frame < 520, dy: 0 });
      }
      return jump.state;
    };
    const a = run();
    expect(a.logic.frame).toBeGreaterThan(70);
    expect(run()).toEqual(a);
  });

  it("starts with the wind of the training setup", () => {
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 1);
    expect(jump.setup.wind.speedMPerS).toBeGreaterThanOrEqual(0);
    expect(jump.setup.wind.speedMPerS).toBeLessThanOrEqual(4.5);
    expect(jump.state.logic.frame).toBe(1);
  });

  it("keeps the presentation clock running after the jump is over", () => {
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 3);
    for (let f = 0; f < 4000 && !isJumpOver(jump); f++) stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(isJumpOver(jump)).toBe(true);
    const end = jump.state.logic.frame;
    stepTrainingJump(jump, { left: true, right: true, dy: 5 });
    stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.frame).toBe(end);
    expect(presentationFrame(jump)).toBe(end + 2);
  });
});
