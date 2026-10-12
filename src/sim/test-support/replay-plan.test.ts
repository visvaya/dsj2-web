import { describe, expect, it } from "vitest";
import { ORIGINAL_POSES } from "../data/pose-table";
import type { FrameInput } from "../jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup } from "../jump-sim";
import {
  BUTTON_WINDOW_FRAMES,
  MOTION_CAPACITY_FRAMES,
  planFromInputs,
  planInputSource,
  planJump,
  planToRecord,
  runScriptedJump,
  type JumpScript,
  type PlanBase,
  type ReplayPlan,
} from "./replay-plan";
import { calmWind, stateHash, syntheticHill } from "./synthetic";

const SETUP: JumpSetup = {
  hill: syntheticHill(),
  kPointM: 90,
  poses: ORIGINAL_POSES,
  wind: calmWind(1),
  randomSeed: 0x1234_5678,
  points: 0,
  presentation: true,
};

const BASE: PlanBase = { hillNumber: 7, randomSeed: SETUP.randomSeed, wind: SETUP.wind };

const CLEAN: JumpScript = {
  startFrame: 70,
  takeoff: { leadS: 0.2, buttons: 2, holdFrames: 14 },
  lean: (frame) => ((frame * 7) % 9) - 4,
  landing: { leadFrames: 36, delayFrames: 0, button: "right", otherButtonAfterFrames: null },
};

const SCRIPTS: { name: string; script: JumpScript }[] = [
  { name: "clean jump", script: CLEAN },
  { name: "no landing press", script: { ...CLEAN, landing: null } },
  { name: "no takeoff press", script: { ...CLEAN, takeoff: null } },
  { name: "neither takeoff nor landing", script: { ...CLEAN, takeoff: null, landing: null, lean: () => 0 } },
  { name: "never leaves the gate", script: { ...CLEAN, startFrame: null } },
  {
    name: "one button held for the whole window, landing prepared at once, wild lean",
    script: {
      startFrame: 90,
      takeoff: { leadS: 0.35, buttons: 1, holdFrames: BUTTON_WINDOW_FRAMES },
      lean: (frame) => (Math.floor(frame / 10) % 2 === 0 ? 60 : -60),
      landing: { leadFrames: 100_000, delayFrames: 0, button: "left", otherButtonAfterFrames: 6 },
    },
  },
  {
    name: "late takeoff and late landing",
    script: {
      ...CLEAN,
      takeoff: { leadS: -0.05, buttons: 2, holdFrames: 5 },
      landing: { leadFrames: 2, delayFrames: 8, button: "right", otherButtonAfterFrames: null },
    },
  },
];

const press = (frames: Record<number, Partial<FrameInput>>, length: number): FrameInput[] =>
  Array.from({ length }, (_, frame) => ({ left: false, right: false, dy: 0, ...frames[frame] }));

function replayHash(setup: JumpSetup, input: (frame: number) => FrameInput): { hash: number; frames: number } {
  let state = createJump(setup);
  let hash = 0x811c9dc5;
  for (let guard = 0; guard < 6000 && jumpRunning(state); guard++) {
    state = stepFrame(state, setup, input);
    hash = stateHash(hash, state);
  }
  return { hash, frames: state.logic.frame };
}

describe("replay plans made from a scripted jump", () => {
  it.each(SCRIPTS)("$name: the plan gives back the input of every frame", ({ script }) => {
    const { inputs } = runScriptedJump(SETUP, script);
    const source = planInputSource(planFromInputs(inputs, BASE));
    expect(inputs.length).toBeGreaterThan(500);
    expect(inputs.map((_, frame) => source(frame))).toEqual(inputs);
  });

  it.each(SCRIPTS)("$name: the jump replayed from the plan is the same jump", ({ script }) => {
    const { inputs, final } = runScriptedJump(SETUP, script);
    const { plan, result } = planJump(SETUP, BASE.hillNumber, script);
    const direct = replayHash(SETUP, (frame) => inputs[frame] ?? { left: false, right: false, dy: 0 });
    expect(replayHash(SETUP, planInputSource(plan))).toEqual(direct);
    expect(result).toEqual({
      frames: final.logic.frame,
      distanceM: final.logic.distanceM,
      fallType: final.logic.fallType,
      phase: final.logic.phase,
      points: final.logic.points,
    });
  });

  it("the scripts reach different endings", () => {
    const endings = SCRIPTS.map(({ script }) => planJump(SETUP, 0, script).result);
    expect(endings[0]?.fallType).toBe(0);
    expect(endings[0]?.distanceM).toBeGreaterThan(30);
    expect(endings[1]?.fallType).toBeGreaterThan(0);
    expect(endings[4]).toMatchObject({ distanceM: 0, fallType: 0, phase: 1 });
  });

  it("survives a trip through JSON", () => {
    const { plan } = planJump(SETUP, 7, CLEAN);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

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

  it("refuses takeoff buttons held longer than the window", () => {
    const script = { ...CLEAN, takeoff: { leadS: 0.2, buttons: 2 as const, holdFrames: BUTTON_WINDOW_FRAMES + 1 } };
    expect(() => runScriptedJump(SETUP, script)).toThrow(RangeError);
  });
});
