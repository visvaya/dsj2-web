import { describe, expect, it } from "vitest";
import { ORIGINAL_POSES } from "../../sim/data/pose-table";
import { createJump, jumpRunning, stepFrame, type JumpSetup } from "../../sim/jump-sim";
import type { FrameInput } from "../../sim/jump-logic";
import { calmWind, stateHash, syntheticHill } from "../../sim/test-support/synthetic";
import {
  BUTTON_WINDOW_FRAMES,
  planFromInputs,
  planInputSource,
  type PlanBase,
} from "../../storage/original-replay-file";
import { planJump, runScriptedJump, type JumpScript } from "./scripted-jump";

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

describe("a scripted player", () => {
  it("refuses takeoff buttons held longer than the window", () => {
    const script = { ...CLEAN, takeoff: { leadS: 0.2, buttons: 2 as const, holdFrames: BUTTON_WINDOW_FRAMES + 1 } };
    expect(() => runScriptedJump(SETUP, script)).toThrow(RangeError);
  });
});
