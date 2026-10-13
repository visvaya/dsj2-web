import { describe, expect, it } from "vitest";
import { createPlayerInput } from "./player-input";
import {
  DEFAULT_SENSITIVITY,
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  parseSensitivity,
  sensitivityFor,
  sensitivityGain,
  stepSensitivity,
} from "./sensitivity";
import { TILT_AT_REST, tiltStep } from "./tilt-input";

describe("sensitivity of the lean", () => {
  it("leaves the motion as it is at the default level and scales it by a tenth per level", () => {
    expect(sensitivityGain(SENSITIVITY_DEFAULT)).toBe(1);
    expect(sensitivityGain(SENSITIVITY_DEFAULT + 1)).toBeCloseTo(1.1, 12);
    expect(sensitivityGain(SENSITIVITY_MAX)).toBeCloseTo(1.1 ** 5, 12);
    expect(sensitivityGain(SENSITIVITY_MIN)).toBeCloseTo(1.1 ** -4, 12);
  });

  it("steps within its scale", () => {
    expect(stepSensitivity(5, 1)).toBe(6);
    expect(stepSensitivity(5, -1)).toBe(4);
    expect(stepSensitivity(SENSITIVITY_MAX, 1)).toBe(SENSITIVITY_MAX);
    expect(stepSensitivity(SENSITIVITY_MIN, -1)).toBe(SENSITIVITY_MIN);
  });

  it("keeps one level per way of steering", () => {
    const levels = { mouse: 3, drag: 7, tilt: 9 };
    expect(sensitivityFor(levels, "mouse")).toBe(3);
    expect(sensitivityFor(levels, "touch")).toBe(7);
    expect(sensitivityFor(levels, "tilt")).toBe(9);
  });

  it("reads stored levels and replaces what is missing or out of the scale with the default", () => {
    expect(parseSensitivity(undefined)).toEqual(DEFAULT_SENSITIVITY);
    expect(parseSensitivity({ mouse: 3, drag: 10, tilt: 1 })).toEqual({ mouse: 3, drag: 10, tilt: 1 });
    expect(parseSensitivity({ mouse: 0, drag: 11, tilt: 2.5 })).toEqual(DEFAULT_SENSITIVITY);
    expect(parseSensitivity({ mouse: "7", tilt: 8 })).toEqual({ ...DEFAULT_SENSITIVITY, tilt: 8 });
  });

  it("makes the tilt lean further for the same turn of the phone at a higher level", () => {
    const from = tiltStep(TILT_AT_REST, 10).state;
    expect(tiltStep(from, 12, sensitivityGain(5)).motion).toBe(6);
    expect(tiltStep(from, 12, sensitivityGain(10)).motion).toBe(10);
    expect(tiltStep(from, 12, sensitivityGain(1)).motion).toBe(4);
  });

  it("does not lose scaled motion: the fraction of a step is carried to the next frame", () => {
    const input = createPlayerInput();
    // Ten frames of 0.4 of a step each: four steps in all, none of them dropped.
    let total = 0;
    for (let frame = 0; frame < 10; frame++) {
      input.addMotion(0.4);
      total += input.takeFrame().dy;
    }
    expect(total).toBe(4);
    // What is cut off at the limit of one frame is still dropped, as in the original.
    input.addMotion(500);
    expect(input.takeFrame().dy).toBe(127);
    expect(input.takeFrame().dy).toBe(0);
  });
});
