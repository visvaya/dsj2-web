import { describe, expect, it } from "vitest";
import { OWN_HILLS, originalHillId, type HillChoice } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { createJump, jumpRunning, stepFrame } from "../sim/jump-sim";
import { decodeReplayFile, parseReplayRecord, replayInputForFrame } from "../sim/replay";
import { encodeReplayFile, planFromInputs, planToRecord, replayHeader } from "../storage/original-replay-file";
import { UI_TEXT } from "../text/ui-text";
import { stepJump } from "./jump-round";
import { originalReplayOutcome } from "./original-replay-choice";

const own = OWN_HILLS[0];
const MAX_FRAMES = 4000;
const T = UI_TEXT.replays;
const ascii = (text: string): number[] => [...new TextEncoder().encode(text)];
const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** The original's hill 1, played on the built-in profile: the test needs no file of the original. */
const hillOne = (): HillChoice => {
  if (!own) throw new Error("no hill");
  return { ...own, id: originalHillId(1), source: "original" };
};

const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: frame > 300 && frame < 480 ? ((frame * 5) % 9) - 4 : 0,
});

/** A training jump, and the same jump as the original would keep it in a replay file. */
function recordedJump(seed: number, change: (record: Uint8Array) => void = () => undefined) {
  let jump: TrainingJump = startTrainingJump(hillOne(), seed);
  const first = jump;
  const inputs: FrameInput[] = [];
  for (let f = 0; f < MAX_FRAMES && !isJumpOver(jump); f++) {
    const stepped = stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, (logic) => handsAt(logic.frame));
    jump = stepped.jump;
    inputs.push(...stepped.taken);
  }
  // A recording starts with the input that computes frame 2 (a jump starts at frame 1); a plan is indexed by the
  // number of the frame being computed.
  const byFrame = [NO_INPUT, NO_INPUT, ...inputs];
  const record = planToRecord(
    planFromInputs(byFrame, { hillNumber: 1, randomSeed: first.setup.randomSeed, wind: first.setup.wind }),
  );
  change(record);
  return { jump, file: encodeReplayFile(replayHeader(1), record) };
}

describe("a replay file of the original", () => {
  it("plays on its hill to the same end as the simulation stepped straight from the file", () => {
    const { jump, file } = recordedJump(4242);
    const outcome = originalReplayOutcome(file, [hillOne()]);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.hill.id).toBe(originalHillId(1));

    let played = outcome.source.start(outcome.hill);
    for (let f = 0; f < MAX_FRAMES && !isJumpOver(played); f++) {
      played = stepJump(played, { steps: 3, leftHeld: false, record: undefined }, outcome.source.input).jump;
    }
    // The way the golden tests step a replay of the original, frame by frame from the decoded file.
    const { header, record } = decodeReplayFile(file);
    const replay = parseReplayRecord(header, record);
    let straight = createJump(played.setup);
    for (let f = 0; f < MAX_FRAMES && jumpRunning(straight); f++) {
      straight = stepFrame(straight, played.setup, (frame) => replayInputForFrame(replay, frame));
    }
    expect(played.state).toEqual(straight);
    // The file came from a training jump of this game, so the replay is that jump.
    expect(played.state).toEqual(jump.state);
  });

  it("names the jumper as the original wrote the name, in code page 852", () => {
    // "Komputer Świat": 0x97 is "Ś" in code page 852. The name is a Pascal string at 0x476.
    const name = [...ascii("Komputer "), 0x97, ...ascii("wiat")];
    const { file } = recordedJump(1, (record) => record.set([name.length, ...name], 0x476));
    const outcome = originalReplayOutcome(file, [hillOne()]);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.source.jumperName).toBe("KOMPUTER ŚWIAT");
  });

  it("is refused when it is not a replay or is damaged", () => {
    const { file } = recordedJump(1);
    expect(originalReplayOutcome(file.subarray(0, 100), [hillOne()])).toEqual({ ok: false, message: T.notReplay });
    const damaged = file.slice();
    damaged[200] = (damaged[200] ?? 0) ^ 0xff;
    expect(originalReplayOutcome(damaged, [hillOne()])).toEqual({ ok: false, message: T.damaged });
  });

  it("is refused with a wind that is not a number", () => {
    const { file } = recordedJump(1, (record) => new DataView(record.buffer).setFloat32(0, Number.NaN, true));
    expect(originalReplayOutcome(file, [hillOne()])).toEqual({ ok: false, message: T.badValues });
  });

  it("needs the hills of the player's Dsj.exe, and the one it was jumped on", () => {
    const { file } = recordedJump(1);
    expect(originalReplayOutcome(file, [])).toEqual({ ok: false, message: T.needsGame });
    const other = { ...hillOne(), id: originalHillId(2) };
    expect(originalReplayOutcome(file, [other])).toEqual({ ok: false, message: T.noHill(1) });
  });
});
