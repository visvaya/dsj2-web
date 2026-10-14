import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, startTrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { jumpResult, stepJump } from "./jump-round";
import { entryPlaysTrue, ownEntry, playedResult, recordReplayOf, sourceOfEntry } from "./shelf-replays";

const hill = OWN_HILLS[0];
const NOW = new Date("2026-10-14T12:00:00.000Z");

const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: frame > 300 && frame < 480 ? ((frame * 3) % 7) - 3 : 0,
});

/** A whole training jump with what the run keeps of it. */
function trainingJump() {
  if (!hill) throw new Error("no hill");
  let jump = startTrainingJump(hill, 2024);
  const inputs: FrameInput[] = [];
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    const stepped = stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, (logic) => handsAt(logic.frame));
    jump = stepped.jump;
    inputs.push(...stepped.taken);
  }
  return { hill, recording: { seed: jump.seed, inputs, newRecord: true }, result: jumpResult(jump) };
}

describe("a replay on the shelf", () => {
  it("plays back to the result it was kept with", () => {
    const { hill: on, recording, result } = trainingJump();
    const entry = ownEntry("kept", on, { recording, result }, NOW);
    expect(entry.id).toContain("kept:own-1:");
    const source = sourceOfEntry(entry);
    if (!source) throw new Error("no source");
    expect(playedResult(source, on)).toEqual(result);
    expect(entryPlaysTrue(entry, source, on)).toBe(true);
  });

  it("does not pass as its jump once its result or its inputs were changed", () => {
    const { hill: on, recording, result } = trainingJump();
    const entry = ownEntry("kept", on, { recording, result }, NOW);
    const source = sourceOfEntry(entry);
    if (!source) throw new Error("no source");
    expect(entryPlaysTrue({ ...entry, result: { ...result, distanceM: result.distanceM + 10 } }, source, on)).toBe(
      false,
    );
    const changed = {
      ...entry,
      replay: {
        kind: "own" as const,
        seed: entry.replay.kind === "own" ? entry.replay.seed + 1 : 0,
        inputs: entry.replay.kind === "own" ? entry.replay.inputs : "",
      },
    };
    const other = sourceOfEntry(changed);
    if (!other) throw new Error("no source");
    expect(entryPlaysTrue(changed, other, on)).toBe(false);
  });

  it("of a hill's record is found for the hill list, and only while it plays true", () => {
    const { hill: on, recording, result } = trainingJump();
    const record = ownEntry("record", on, { recording, result }, NOW);
    expect(recordReplayOf([record], on)?.origin).toBe("original");
    expect(recordReplayOf([{ ...record, kind: "kept" }], on)).toBeNull();
    expect(recordReplayOf([{ ...record, result: { ...result, points: result.points + 1 } }], on)).toBeNull();
  });

  it("has no source when its data cannot be read", () => {
    const { hill: on, recording, result } = trainingJump();
    const entry = ownEntry("kept", on, { recording, result }, NOW);
    expect(sourceOfEntry({ ...entry, replay: { kind: "own", seed: 1, inputs: "!!" } })).toBeNull();
    expect(sourceOfEntry({ ...entry, replay: { kind: "original", rpl: "AAAA" } })).toBeNull();
  });
});
