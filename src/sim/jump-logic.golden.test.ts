import { describe, expect, it } from "vitest";
import { BorlandRandom } from "./borland-random";
import { ORIGINAL_POSES } from "./data/pose-table";
import { stepLogic } from "./jump-logic";
import { FRAME_DT_S } from "./physics-constants";
import {
  TRACE_POINT,
  decodeHill,
  decodeInput,
  decodeJumperState,
  decodeKPoint,
  decodeLogic,
  decodePose,
  decodeRandSeed,
  diffStates,
  listTraces,
  readTrace,
} from "./test-support/dsj-trace";

const traces = listTraces();
const REL_TOLERANCE = 1e-6;
/** Incremented by the loop before the next snapshot. */
const SKIP = new Set(["logic.frame"]);

describe.skipIf(traces.length === 0)("frame logic against original game traces", () => {
  for (const trace of traces) {
    it(`${trace.name}: reproduces each frame from the entry snapshot`, () => {
      const snaps = readTrace(trace.path);
      const next = new Map(snaps.filter((s) => s.point === TRACE_POINT.windUpdate).map((s) => [s.frame, s]));
      const entries = snaps.filter((s) => s.point === TRACE_POINT.frameLogic);
      const failures: string[] = [];
      for (const entry of entries) {
        const exit = next.get(entry.frame + 1);
        if (!exit) continue;
        const v = entry.view;
        const frame = {
          logic: decodeLogic(v),
          jumper: decodeJumperState(v),
          pose: decodePose(v),
          windSpeedMPerS: v.getFloat32(0x4d1c, true),
          windDirectionRad: v.getFloat32(0x4d20, true),
        };
        const rng = new BorlandRandom(decodeRandSeed(v));
        stepLogic(
          frame,
          decodeInput(v),
          { hill: decodeHill(v), kPointM: decodeKPoint(v), poses: ORIGINAL_POSES, dtS: FRAME_DT_S, presentation: true },
          rng,
        );
        const want = {
          logic: decodeLogic(exit.view),
          jumper: decodeJumperState(exit.view),
          pose: decodePose(exit.view),
          seed: decodeRandSeed(exit.view),
        };
        const got = { logic: frame.logic, jumper: frame.jumper, pose: frame.pose, seed: rng.seed };
        const bad = diffStates(got, want, REL_TOLERANCE, SKIP);
        if (bad.length > 0 && failures.length < 6) {
          failures.push(`frame ${entry.frame} (phase ${decodeLogic(v).phase}): ${bad.slice(0, 8).join("; ")}`);
        }
      }
      expect(entries.length).toBeGreaterThan(500);
      expect(failures).toEqual([]);
    });
  }
});
