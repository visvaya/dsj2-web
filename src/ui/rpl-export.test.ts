import { describe, expect, it } from "vitest";
import { OWN_HILLS, originalHillId, type HillChoice } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import { ORDINARY_JUMP } from "../original/test-support/hill-plans";
import { runScriptedJump, type JumpScript } from "../original/test-support/scripted-jump";
import { MOTION_CAPACITY_FRAMES } from "../storage/original-replay-file";
import { decodeInputs } from "../storage/input-codec";
import { type ShelfEntry } from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";
import { jumpResult, stepJump } from "./jump-round";
import { originalReplayOutcome } from "./original-replay-choice";
import { approximateInputs, rplExport, rplExportable, rplFileName } from "./rpl-export";
import { ownEntry } from "./shelf-replays";

const T = UI_TEXT.replays;
const SEED = 4242;
const JUMPED_AT = new Date(2026, 9, 15, 7, 5, 9);
const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** The original's hill 1, played on the built-in profile: the test needs no file of the original. */
const hillOne = (): HillChoice => {
  const own = OWN_HILLS[0];
  if (!own) throw new Error("no hill");
  return { ...own, id: originalHillId(1), source: "original" };
};

/**
 * A training jump kept on the shelf: the ordinary jump of the hill plans with `change` applied to its input (by
 * the number of the frame being computed), played the way the game plays and records a jump.
 */
function keptJump(
  change: (frame: number, input: FrameInput) => FrameInput = (_, input) => input,
  script: JumpScript = ORDINARY_JUMP,
) {
  const hill = hillOne();
  const planned = runScriptedJump(startTrainingJump(hill, SEED).setup, script).inputs;
  const inputs = planned.map((input, frame) => change(frame, input));
  let jump: TrainingJump = startTrainingJump(hill, SEED);
  const taken: FrameInput[] = [];
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    const step = stepJump(
      jump,
      { steps: 1, leftHeld: false, record: undefined },
      (l) => inputs[l.frame + 1] ?? NO_INPUT,
    );
    jump = step.jump;
    taken.push(...step.taken);
  }
  const recording = { seed: SEED, inputs: taken, newRecord: false };
  return { hill, jump, entry: ownEntry("kept", hill, { recording, result: jumpResult(jump) }, JUMPED_AT) };
}

/** The takeoff with the right button down first and up last, the left one only in between (as a mouse may). */
const rightAroundLeft = (frame: number, input: FrameInput): FrameInput =>
  frame >= 311 && frame < 325 ? { ...input, left: frame >= 314 && frame < 321, right: true } : input;

/** The takeoff with the right button alone. */
const rightOnlyTakeoff = (frame: number, input: FrameInput): FrameInput =>
  frame >= 311 && frame < 325 ? { ...input, left: false } : input;

/** The frame being computed when the right button last went down, from the inputs as the shelf keeps them. */
function lastRightPress(stored: string): number {
  const inputs = decodeInputs(stored) ?? [];
  // The stored input of index i computes frame i + 2.
  return inputs.findLastIndex((input, i) => input.right && inputs[i - 1]?.right !== true) + 2;
}

// A long wait on the gate and a mouse never still: more frames of motion than a file holds, most of them on
// the gate, in the inrun and in the outrun, where the jump does not react to it.
const restless = (frame: number, input: FrameInput): FrameInput => ({ ...input, dy: input.dy || (frame % 5) - 2 });

/** The jump a file of the original plays to, as the replay screen would play it. */
function playedFile(file: Uint8Array, hill: HillChoice): TrainingJump {
  const outcome = originalReplayOutcome(file, [hill]);
  if (!outcome.ok) throw new Error(outcome.message);
  let jump = outcome.source.start(outcome.hill);
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    jump = stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, outcome.source.input).jump;
  }
  return jump;
}

const fileOf = (entry: ShelfEntry, hill: HillChoice): Uint8Array => {
  const made = rplExport(entry, [hill]);
  if (!made.ok) throw new Error(made.message);
  return made.file;
};

describe("a jump of this game as a file of the original", () => {
  it("plays to the same jump and carries what the replay studio shows", () => {
    const { hill, jump, entry } = keptJump();
    const file = fileOf(entry, hill);
    expect(playedFile(file, hill).state).toEqual(jump.state);
    const { header, record } = decodeReplayFile(file);
    expect(parseReplayRecord(header, record)).toMatchObject({
      versionTag: "//DSJ_v2.00//",
      hillIndex: 1,
      distanceText: jump.state.logic.distanceM.toFixed(2),
      jumperName: UI_TEXT.hud.playerName,
      date: "2026/10/15",
    });
  });

  it("leaves out a press the jump did not react to", () => {
    // A press of the right button on the gate: the format would take it for the landing press.
    const { hill, jump, entry } = keptJump((frame, input) => (frame === 50 ? { ...input, right: true } : input));
    expect(jump.state.logic.distanceM).toBe(keptJump().jump.state.logic.distanceM);
    expect(playedFile(fileOf(entry, hill), hill).state).toEqual(jump.state);
  });

  it("keeps a held button as the one frame the jump reacted to", () => {
    const clean = keptJump();
    const landingFrame = clean.entry.replay.kind === "own" ? lastRightPress(clean.entry.replay.inputs) : -1;
    // Clicks of a mouse: the start and the landing button held down for several frames each.
    const { hill, jump, entry } = keptJump((frame, input) => ({
      ...input,
      left: input.left || (frame > 70 && frame < 77),
      right: input.right || (frame > landingFrame && frame < landingFrame + 7),
    }));
    expect(jump.state).toEqual(clean.jump.state);
    expect(playedFile(fileOf(entry, hill), hill).state).toEqual(jump.state);
  });

  it("keeps the frame a button held on the gate started the jump in", () => {
    // The left button goes down before the gate lets the jumper go (frame 65) and stays down a few frames past it,
    // as a mouse held until the start shows.
    const { hill, jump, entry } = keptJump((frame, input) => ({
      ...input,
      left: input.left || (frame >= 50 && frame < 71),
    }));
    expect(jump.state.logic.distanceM).toBeGreaterThan(0);
    expect(playedFile(fileOf(entry, hill), hill).state).toEqual(jump.state);
  });

  it("takes two thumbs a few frames apart at the takeoff", () => {
    // On a phone: a tap of the left zone, then one of the right zone, each a frame long, instead of both buttons.
    const { hill, jump, entry } = keptJump((frame, input) =>
      frame >= 311 && frame < 325 ? { ...input, left: frame === 311, right: frame === 315 } : input,
    );
    expect(playedFile(fileOf(entry, hill), hill).state).toEqual(jump.state);
  });

  it("keeps only the motion of the air when a mouse moved all along", () => {
    const { hill, jump, entry } = keptJump(restless, { ...ORDINARY_JUMP, startFrame: 400 });
    expect(jump.state.logic.frame).toBeGreaterThan(MOTION_CAPACITY_FRAMES + 50);
    expect(playedFile(fileOf(entry, hill), hill).state).toEqual(jump.state);
  });

  it.each([
    ["the right button down before the left and up after it", rightAroundLeft],
    ["the right button alone", rightOnlyTakeoff],
  ])("takes a takeoff with %s, which the window keeps as the left one", (_, takeoff) => {
    // The jump counts the buttons down at the takeoff, not which ones.
    const { hill, jump, entry } = keptJump(takeoff);
    const made = rplExport(entry, [hill]);
    if (!made.ok) throw new Error(made.message);
    expect(made.approximate).toBe(false);
    expect(playedFile(made.file, hill).state).toEqual(jump.state);
  });

  it("needs the hill of the jump among the hills of the player's Dsj.exe", () => {
    const { entry } = keptJump();
    expect(rplExport(entry, [])).toEqual({ ok: false, message: T.hillMissing });
  });

  it("is refused for a replay that no longer plays to its result", () => {
    const { hill, entry } = keptJump();
    const changed = { ...entry, result: { ...entry.result, distanceM: entry.result.distanceM + 1 } };
    expect(rplExport(changed, [hill])).toEqual({ ok: false, message: T.notTrue });
  });

  it("is offered only for the hills of the original", () => {
    const { entry } = keptJump();
    expect(rplExportable(entry)).toBe(true);
    const ownHill = OWN_HILLS[0];
    if (!ownHill) throw new Error("no hill");
    expect(rplExportable({ ...entry, hill: { ...entry.hill, id: ownHill.id } })).toBe(false);
  });

  it("is named after the day and the time of the jump to the second, in eight characters", () => {
    expect(rplFileName(keptJump().entry)).toBe("15070509.rpl");
  });
});

describe("a file of the original kept on the shelf", () => {
  it("goes out as it came", () => {
    const { hill, entry } = keptJump();
    const file = fileOf(entry, hill);
    const original: ShelfEntry = { ...entry, replay: { kind: "original", rpl: btoa(String.fromCharCode(...file)) } };
    expect(rplExportable(original)).toBe(true);
    expect(rplExport(original, [])).toEqual({ ok: true, file, approximate: false });
  });
});

/** Input by frame number with the given frames pressed or moved. */
const press = (frames: Record<number, Partial<FrameInput>>, length: number): FrameInput[] =>
  Array.from({ length }, (_, frame) => ({ ...NO_INPUT, ...frames[frame] }));

describe("the input as near as the format comes", () => {
  // Gate until 69, inrun from 70, the air from 300 to 399, the outrun after it.
  const phases = Array.from({ length: 500 }, (_, frame) => (frame < 70 ? 1 : frame < 300 ? 2 : frame < 400 ? 7 : 11));

  it("keeps motion only in the air, pairs a lone right press with the left one and keeps one frame of a press", () => {
    const inputs = press(
      {
        10: { dy: 3 },
        70: { left: true },
        71: { left: true },
        305: { left: true, dy: 2 },
        320: { right: true },
        410: { dy: -4 },
        420: { left: true },
        421: { left: true },
      },
      500,
    );
    const [still, paired, short] = approximateInputs(inputs, phases);
    expect(still?.map((input) => input.dy).filter((dy) => dy !== 0)).toEqual([2]);
    expect(paired?.[320]).toEqual({ left: true, right: true, dy: 0 });
    // The start press keeps the frame the jump left the gate in; the takeoff press is left as it was.
    expect(short?.[70]?.left).toBe(true);
    expect(short?.[71]?.left).toBe(false);
    expect(short?.[420]?.left).toBe(true);
    expect(short?.[421]?.left).toBe(false);
  });
});
