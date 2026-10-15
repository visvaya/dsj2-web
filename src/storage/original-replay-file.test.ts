import { describe, expect, it } from "vitest";
import type { FrameInput } from "../sim/jump-logic";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import { calmWind } from "../sim/test-support/synthetic";
import {
  BUTTON_WINDOW_FRAMES,
  MOTION_CAPACITY_FRAMES,
  encodeReplayFile,
  planFromInputs,
  planToRecord,
  replayHeader,
  type PlanBase,
  type ReplayPlan,
} from "./original-replay-file";

const BASE: PlanBase = { hillNumber: 7, randomSeed: 0x1234_5678, wind: calmWind(1) };

const press = (frames: Record<number, Partial<FrameInput>>, length: number): FrameInput[] =>
  Array.from({ length }, (_, frame) => ({ left: false, right: false, dy: 0, ...frames[frame] }));

describe("the shape of a plan", () => {
  const inputs = press(
    {
      70: { left: true },
      300: { left: true, right: true },
      301: { left: true },
      303: { left: true, right: true },
      320: { dy: -5 },
      321: { dy: 127 },
      323: { dy: -128 },
      400: { right: true },
      410: { left: true },
    },
    500,
  );
  const plan = planFromInputs(inputs, BASE);

  it("names the frames and lists the takeoff window and the motion", () => {
    expect(plan).toEqual({
      ...BASE,
      startFrame: 70,
      buttonWindowStart: 300,
      buttonWindow: [2, 1, 0, 2, ...Array.from({ length: 16 }, () => 0)],
      motionStart: 320,
      motionEnd: 323,
      motion: [-5, 127, 0, -128],
      leftLandingFrame: 410,
      rightLandingFrame: 400,
    } satisfies ReplayPlan);
  });

  it("puts every field at its documented offset of the record", () => {
    const record = planToRecord(plan);
    const view = new DataView(record.buffer);
    expect(record.length).toBe(0x4b5);
    expect(view.getFloat32(0x00, true)).toBe(BASE.wind.xMPerS);
    expect(view.getFloat32(0x1c, true)).toBe(BASE.wind.indicatorMaxTurnRateRad);
    expect(record[0x20]).toBe(7);
    expect(view.getUint32(0x2c, true)).toBe(0x1234_5678);
    expect([...record.subarray(0x30, 0x35)]).toEqual([0xfb, 0x7f, 0x00, 0x80, 0x00]);
    expect([0x44a, 0x44e, 0x452, 0x46a, 0x46e, 0x472].map((o) => view.getInt32(o, true))).toEqual([
      70, 300, 320, 410, 400, 323,
    ]);
    expect([...record.subarray(0x456, 0x45b)]).toEqual([2, 1, 0, 2, 0]);
  });

  it("needs no takeoff window for a landing press alone", () => {
    const only = planFromInputs(press({ 70: { left: true }, 400: { right: true } }, 500), BASE);
    expect(only).toMatchObject({ startFrame: 70, buttonWindowStart: 0, leftLandingFrame: 0, rightLandingFrame: 400 });
    expect(only.buttonWindow.every((b) => b === 0)).toBe(true);
    expect(only).toMatchObject({ motionStart: 1, motionEnd: 0, motion: [] });
  });

  it("ends the takeoff window with the takeoff when a landing press follows soon after it", () => {
    // A small hill: the landing press comes within 20 frames of the takeoff press.
    const soon = press({ 70: { left: true }, 300: { left: true }, 310: { right: true }, 316: { left: true } }, 400);
    expect(planFromInputs(soon, BASE)).toMatchObject({
      startFrame: 70,
      buttonWindowStart: 281,
      rightLandingFrame: 310,
      leftLandingFrame: 316,
    });
  });

  it("holds a jump without a start press", () => {
    expect(planFromInputs(press({}, 100), BASE)).toMatchObject({ startFrame: 0, buttonWindowStart: 0 });
  });

  it.each([
    [
      "a third press after the window",
      press({ 70: { left: true }, 300: { left: true }, 400: { right: true }, 420: { right: true } }, 500),
    ],
    [
      "a right button alone inside the window",
      press({ 70: { left: true }, 300: { left: true }, 305: { right: true }, 400: { right: true } }, 500),
    ],
    [
      "motion over more frames than a record holds",
      press({ 100: { dy: 1 }, [100 + MOTION_CAPACITY_FRAMES]: { dy: 1 } }, 1300),
    ],
  ])("refuses %s", (_, bad) => {
    expect(() => planFromInputs(bad, BASE)).toThrow(/does not fit the replay format/);
  });

  it("holds motion that just fits", () => {
    const fits = press({ 100: { dy: 1 }, [99 + MOTION_CAPACITY_FRAMES]: { dy: -1 } }, 1300);
    expect(planFromInputs(fits, BASE).motion).toHaveLength(MOTION_CAPACITY_FRAMES);
  });

  it.each([
    ["a window value above 2", { buttonWindow: Array.from({ length: BUTTON_WINDOW_FRAMES }, () => 3) }],
    ["a short window", { buttonWindow: [2, 2] }],
    ["motion outside a signed byte", { motion: [200, 0, 0, 0] }],
    ["a motion list of the wrong length", { motion: [1] }],
    ["a negative frame", { startFrame: -1 }],
    ["a hill number above a byte", { hillNumber: 256 }],
  ])("refuses to encode %s", (_, change) => {
    expect(() => planToRecord({ ...plan, ...change })).toThrow(RangeError);
  });
});

describe("a replay file written by this game", () => {
  const plan = planFromInputs(press({ 70: { left: true }, 300: { left: true }, 400: { right: true } }, 500), BASE);

  it("is read back by the decoder with the record and the labels it was written with", () => {
    const record = planToRecord(plan, { distanceText: "89.92", jumperName: "GRACZ 1", date: "2026/10/15" });
    const file = encodeReplayFile(replayHeader(7), record);
    expect(file.length).toBe(1222);
    const decoded = decodeReplayFile(file);
    expect([...decoded.record]).toEqual([...record]);
    const replay = parseReplayRecord(decoded.header, decoded.record);
    expect(replay).toMatchObject({
      versionTag: "//DSJ_v2.00//",
      hillIndex: 7,
      hillRecordValue: 0,
      distanceText: "89.92",
      jumperName: "GRACZ 1",
      date: "2026/10/15",
      licensee: "",
      startFrame: 70,
      rightLandingFrame: 400,
    });
  });

  it("carries the header the original writes for its hill", () => {
    expect(new TextDecoder().decode(replayHeader(32))).toBe("//DSJ_v2.00//");
    expect(new TextDecoder().decode(replayHeader(33))).toBe("//DSJ_v2.1P//");
  });

  it("cuts labels to their fields and writes what is not printable ASCII as a question mark", () => {
    const record = planToRecord(plan, { distanceText: "123.456", jumperName: "Łukasz".padEnd(30, "x"), date: "" });
    const replay = parseReplayRecord(replayHeader(7), record);
    expect(replay.distanceText).toBe("123.45");
    expect(replay.jumperName).toBe(`?ukasz${"x".repeat(19)}`);
    expect(replay.date).toBe("");
  });
});
