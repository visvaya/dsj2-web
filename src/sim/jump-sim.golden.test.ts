import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORIGINAL_POSES } from "./data/pose-table";
import { createJump, jumpRunning, stepFrame, type JumpSetup } from "./jump-sim";
import { decodeReplayFile, parseReplayRecord, replayInputForFrame } from "./replay";
import {
  TRACE_POINT,
  decodeHill,
  decodeJumperState,
  decodeKPoint,
  decodeLogic,
  decodePose,
  decodeRandSeed,
  decodeWind,
  diffStates,
  readTrace,
} from "./test-support/dsj-trace";
import { goldenTraces, replayCases } from "./test-support/golden-files";

const golden = goldenTraces();
const { cases, missing } = replayCases(golden.traces);
const REL_TOLERANCE = 1e-5;

describe.skipIf(!golden.requested)("whole jump from a replay file against the original game", () => {
  it("has the traces it was asked to compare", () => {
    expect(golden.problems).toEqual([]);
  });

  it("has the replay file of every trace", () => {
    expect(missing).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.name}: same state every frame and the recorded distance`, () => {
      const { header, record } = decodeReplayFile(new Uint8Array(readFileSync(c.replay)));
      const replay = parseReplayRecord(header, record);
      const snaps = readTrace(c.path);
      const byFrame = new Map(snaps.filter((s) => s.point === TRACE_POINT.windUpdate).map((s) => [s.frame, s]));
      const first = snaps[0];
      if (!first) throw new Error("empty trace");
      const setup: JumpSetup = {
        hill: decodeHill(first.view),
        kPointM: decodeKPoint(first.view),
        poses: ORIGINAL_POSES,
        wind: replay.wind,
        randomSeed: replay.randomSeed,
        points: 0,
        presentation: true,
      };
      let state = createJump(setup);
      const failures: string[] = [];
      let compared = 0;
      const input = (frame: number) => replayInputForFrame(replay, frame);
      for (let guard = 0; guard < 5000 && jumpRunning(state); guard++) {
        state = stepFrame(state, setup, input);
        const snap = byFrame.get(state.logic.frame + 1);
        if (!snap) continue;
        compared++;
        const want = {
          logic: decodeLogic(snap.view),
          jumper: decodeJumperState(snap.view),
          pose: decodePose(snap.view),
          wind: decodeWind(snap.view),
          seed: decodeRandSeed(snap.view),
        };
        const got = {
          logic: state.logic,
          jumper: state.jumper,
          pose: state.pose,
          wind: state.wind,
          seed: state.randomSeed,
        };
        const bad = diffStates(got, want, REL_TOLERANCE, new Set(["logic.frame"]));
        if (bad.length > 0 && failures.length < 4) {
          failures.push(`frame ${state.logic.frame} phase ${state.logic.phase}: ${bad.slice(0, 6).join("; ")}`);
        }
      }
      expect(compared).toBeGreaterThan(500);
      expect(failures).toEqual([]);
      expect(state.logic.distanceM.toFixed(2)).toBe(replay.distanceText);
    });
  }
});
