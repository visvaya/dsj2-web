import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { REPLAY_SPEEDS, nextReplaySpeed, recordedInput, type JumpRecording, type ReplaySpeed } from "./jump-replay";
import { stepJump, type JumpCue } from "./jump-round";

const hill = OWN_HILLS[0];
const MAX_FRAMES = 4000;

/** Hands that lean too, so the motion of the mouse is part of what the replay must give back. */
const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: frame > 300 && frame < 480 ? ((frame * 7) % 11) - 5 : 0,
});

const start = (seed: number): TrainingJump => {
  if (!hill) throw new Error("no hill");
  return startTrainingJump(hill, seed);
};

/** A whole jump in chunks of a few frames, and everything the steps reported on the way. */
const play = (first: TrainingJump, chunk: number, take: Parameters<typeof stepJump>[2]) => {
  let jump = first;
  const cues: JumpCue[] = [];
  const taken: FrameInput[] = [];
  for (let f = 0; f < MAX_FRAMES && !isJumpOver(jump); f += chunk) {
    const stepped = stepJump(jump, { steps: chunk, leftHeld: false, record: undefined }, take);
    jump = stepped.jump;
    cues.push(...stepped.cues);
    taken.push(...stepped.taken);
  }
  return { jump, cues, taken };
};

describe("replay of a training jump", () => {
  for (const seed of [1, 12345, 0xdeadbeef]) {
    it(`gives back the same jump, frame for frame, at another pace (seed ${seed})`, () => {
      const live = play(start(seed), 3, (logic) => handsAt(logic.frame));
      expect(live.jump.state.logic.finished).toBe(true);
      const recording: JumpRecording = { seed: live.jump.seed, inputs: live.taken, newRecord: false };
      const again = play(start(recording.seed), 1, (logic) => recordedInput(recording, logic));
      expect(again.jump.state).toEqual(live.jump.state);
      expect(again.cues).toEqual(live.cues);
    });
  }

  it("of a jump left while the jumper slides out gives the same result, the rest played without hands", () => {
    let jump = start(99);
    const taken: FrameInput[] = [];
    // The player leaves at the touchdown, as a press for the next jump does once the notes are up.
    for (let f = 0; f < MAX_FRAMES && !jump.state.logic.finished; f++) {
      const stepped = stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, (logic) => handsAt(logic.frame));
      jump = stepped.jump;
      taken.push(...stepped.taken);
    }
    expect(jump.state.logic.finished).toBe(true);
    const recording: JumpRecording = { seed: jump.seed, inputs: taken, newRecord: false };
    const again = play(start(recording.seed), 2, (logic) => recordedInput(recording, logic));
    expect(again.jump.state.logic.distanceM).toBe(jump.state.logic.distanceM);
    expect(again.jump.state.logic.points).toBe(jump.state.logic.points);
  });

  it("records only the frames the simulation ran", () => {
    const live = play(start(7), 5, (logic) => handsAt(logic.frame));
    expect(live.taken).toHaveLength(live.jump.state.logic.frame - 1);
  });

  it("gives no input past the end of the recording", () => {
    const recording: JumpRecording = { seed: 1, inputs: [{ left: true, right: true, dy: 3 }], newRecord: false };
    expect(recordedInput(recording, { frame: 1 })).toEqual({ left: true, right: true, dy: 3 });
    expect(recordedInput(recording, { frame: 2 })).toEqual({ left: false, right: false, dy: 0 });
  });
});

describe("replay tempo", () => {
  it("goes through every tempo and back to the first", () => {
    const seen: ReplaySpeed[] = [REPLAY_SPEEDS[0]];
    for (let i = 1; i < REPLAY_SPEEDS.length + 1; i++) seen.push(nextReplaySpeed(seen[i - 1] ?? REPLAY_SPEEDS[0]));
    expect(seen).toEqual([...REPLAY_SPEEDS, REPLAY_SPEEDS[0]]);
  });
});
