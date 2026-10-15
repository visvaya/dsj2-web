import { describe, expect, it } from "vitest";
import type { FrameInput } from "../sim/jump-logic";
import { decodeInputs, encodeInputs } from "./input-codec";

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** A jump of 900 frames: a start, both buttons at the takeoff, a lean in the air, a landing press. */
function jumpInputs(motion: (frame: number) => number): FrameInput[] {
  return Array.from({ length: 900 }, (_, frame) => ({
    left: frame === 70 || (frame >= 311 && frame < 325) || frame === 556,
    right: (frame >= 311 && frame < 325) || frame === 549,
    dy: frame >= 330 && frame < 540 ? motion(frame) : 0,
  }));
}

/** The text of the first form: two bytes a frame, in base64. */
const firstForm = (inputs: readonly FrameInput[]): string =>
  btoa(
    String.fromCharCode(...inputs.flatMap((input) => [(input.left ? 1 : 0) | (input.right ? 2 : 0), input.dy & 0xff])),
  );

describe("the input of a jump as text", () => {
  it.each([
    ["no motion", () => 0],
    ["a lean", () => 1],
    ["a restless mouse", (frame: number) => ((frame * 37) % 256) - 128],
  ])("comes back frame by frame with %s", (_, motion) => {
    const inputs = jumpInputs(motion);
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });

  it("comes back for the empty input and for motion at the first and the last frame", () => {
    expect(decodeInputs(encodeInputs([]))).toEqual([]);
    const ends = [{ ...NO_INPUT, dy: -128 }, NO_INPUT, { left: true, right: true, dy: 127 }];
    expect(decodeInputs(encodeInputs(ends))).toEqual(ends);
  });

  it("takes a few dozen bytes for a jump without motion, and one byte a frame of motion", () => {
    expect(encodeInputs(jumpInputs(() => 0)).length).toBeLessThan(40);
    expect(encodeInputs(jumpInputs(() => 1)).length).toBeLessThan(((210 + 30) * 4) / 3);
  });

  it("reads the first form, as replays kept before were written", () => {
    const inputs = jumpInputs((frame) => (frame % 5) - 2);
    expect(decodeInputs(firstForm(inputs))).toEqual(inputs);
  });

  it.each([
    ["text that is not base64", "2:***"],
    ["a cut-off text", encodeInputs(jumpInputs(() => 1)).slice(0, 40)],
    ["bytes left over", `2:${btoa(String.fromCharCode(1, 0, 0, 0, 7))}`],
    ["a press beyond the frames", `2:${btoa(String.fromCharCode(10, 1, 8, 5, 1, 0, 0))}`],
    ["a press without buttons", `2:${btoa(String.fromCharCode(10, 1, 0, 1, 0, 0, 0))}`],
    ["motion beyond the frames", `2:${btoa(String.fromCharCode(3, 0, 2, 5, 1, 1, 1, 1, 1))}`],
    ["more frames than a jump has", `2:${btoa(String.fromCharCode(0xff, 0xff, 0x7f, 0, 0, 0))}`],
    ["a first form of odd length", btoa(String.fromCharCode(1, 0, 1))],
  ])("refuses %s", (_, text) => {
    expect(decodeInputs(text)).toBeNull();
  });
});
