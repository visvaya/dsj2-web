import { describe, expect, it } from "vitest";
import { BorlandRandom } from "./borland-random";
import { cpuJumpRunning, stepCpuFrame, type CpuJumpState } from "./cpu-jump";
import { cpuPilotInput, drawCpuForm, drawCpuTalents, setupCpuPilot } from "./cpu-pilot";
import { ORIGINAL_POSES } from "./data/pose-table";
import { createJump, type JumpSetup } from "./jump-sim";
import { FRAME_DT_S } from "./physics-constants";
import {
  TRACE_POINT,
  decodeCpuPilot,
  decodeCpuPilotView,
  decodeCpuRecord,
  decodeHill,
  decodeInput,
  decodeJumperIndex,
  decodeJumperListEntry,
  decodeJumperState,
  decodeKPoint,
  decodeLogic,
  decodeNoDraw,
  decodePose,
  decodeRandSeed,
  decodeRandomLevel,
  decodeWind,
  diffStates,
  readTrace,
  type TraceSnapshot,
} from "./test-support/dsj-trace";
import { cpuGoldenTraces } from "./test-support/golden-files";

const golden = cpuGoldenTraces();
/** The whole jump accumulates over hundreds of frames, as in jump-sim.golden.test.ts. */
const JUMP_REL_TOLERANCE = 1e-5;
const FIRST_JUMPER = 1;
const LAST_JUMPER = 16;

function only(snaps: readonly TraceSnapshot[], point: number): TraceSnapshot {
  const found = snaps.filter((s) => s.point === point);
  const [first] = found;
  if (found.length !== 1 || first === undefined)
    throw new Error(`expected one snapshot at point ${point}, found ${found.length}`);
  return first;
}

describe.skipIf(!golden.requested)("computer jumpers against the original game", () => {
  it("has the traces it was asked to compare", () => {
    expect(golden.problems).toEqual([]);
  });

  for (const trace of golden.cups) {
    it(`${trace.name}: talents at the cup start and forms at the competition start`, () => {
      const snaps = readTrace(trace.path);
      const pairs = [
        [TRACE_POINT.cupStart, TRACE_POINT.cupEnd],
        [TRACE_POINT.competitionStart, TRACE_POINT.competitionEnd],
      ] as const;
      let drawn = 0;
      for (const [startPoint, endPoint] of pairs) {
        const start = only(snaps, startPoint).view;
        const end = only(snaps, endPoint).view;
        const rng = new BorlandRandom(decodeRandSeed(start));
        const got: unknown[] = [];
        const want: unknown[] = [];
        let randomLevel: number | undefined;
        for (let i = FIRST_JUMPER; i <= LAST_JUMPER; i++) {
          const entry = decodeJumperListEntry(start, i);
          if (!entry.takesPart || !entry.cpu) continue;
          drawn++;
          const record = decodeCpuRecord(end, i);
          if (startPoint === TRACE_POINT.cupStart) {
            const talents = drawCpuTalents(entry.level, rng);
            if (entry.level !== talents.level) randomLevel = talents.level;
            got.push(talents);
            want.push({ talent1: record.talent1, talent2: record.talent2, level: record.level });
          } else {
            got.push(drawCpuForm(rng));
            want.push({ form1: record.form1, form2: record.form2 });
          }
        }
        expect(diffStates({ got, seed: rng.seed }, { got: want, seed: decodeRandSeed(end) }, 0)).toEqual([]);
        expect(randomLevel === undefined ? undefined : decodeRandomLevel(end)).toBe(randomLevel);
      }
      expect(drawn, "computer jumpers drawn").toBeGreaterThan(0);
    });
  }

  for (const trace of golden.jumps) {
    it(`${trace.name}: setup, pilot every frame and the whole jump`, () => {
      const snaps = readTrace(trace.path);
      const entry = only(snaps, TRACE_POINT.cpuSetupEntry).view;
      const exit = only(snaps, TRACE_POINT.cpuSetupExit).view;
      const hill = decodeHill(entry);
      const kPointM = decodeKPoint(entry);

      // Setup: from the record and the seed at its entry to the pilot state and the seed at its exit.
      const rng = new BorlandRandom(decodeRandSeed(entry));
      const pilot = setupCpuPilot(decodeCpuRecord(entry, decodeJumperIndex(entry)), kPointM, hill, rng);
      expect(
        diffStates({ pilot, seed: rng.seed }, { pilot: decodeCpuPilot(exit), seed: decodeRandSeed(exit) }, 0),
      ).toEqual([]);

      // Pilot: from each read_input entry to the input and pilot state at the next frame_logic entry.
      const logicEntries = new Map(snaps.filter((s) => s.point === TRACE_POINT.frameLogic).map((s) => [s.frame, s]));
      const pilotFailures: string[] = [];
      let pilotFrames = 0;
      for (const at of snaps.filter((s) => s.point === TRACE_POINT.readInput)) {
        const after = logicEntries.get(at.frame);
        if (!after) continue;
        pilotFrames++;
        const view = decodeCpuPilotView(at.view);
        const out = cpuPilotInput(decodeCpuPilot(at.view), view, hill, FRAME_DT_S, new BorlandRandom(view.randomSeed));
        const bad = diffStates(out, { input: decodeInput(after.view), pilot: decodeCpuPilot(after.view) }, 0);
        if (bad.length > 0 && pilotFailures.length < 6)
          pilotFailures.push(`frame ${at.frame} phase ${view.phase}: ${bad.join("; ")}`);
      }
      expect(pilotFrames).toBeGreaterThan(500);
      expect(pilotFailures).toEqual([]);

      // Whole jump: physics and pilot from the seed after the setup, compared every frame.
      const byFrame = new Map(snaps.filter((s) => s.point === TRACE_POINT.windUpdate).map((s) => [s.frame, s]));
      const first = snaps.find((s) => s.point === TRACE_POINT.windUpdate);
      if (!first) throw new Error("no frame in the trace");
      const setup: JumpSetup = {
        hill,
        kPointM,
        poses: ORIGINAL_POSES,
        wind: decodeWind(exit),
        randomSeed: decodeRandSeed(exit),
        points: decodeLogic(first.view).points,
        presentation: !decodeNoDraw(first.view),
      };
      const end = only(snaps, TRACE_POINT.jumpEnd);
      // The state before the first frame: cleared fields as the original clears them, the rest left over from
      // the jump before (createJump's `previous`).
      const before = {
        logic: decodeLogic(first.view),
        jumper: decodeJumperState(first.view),
        pose: decodePose(first.view),
        wind: decodeWind(first.view),
        randomSeed: decodeRandSeed(first.view),
      };
      const initial = createJump(setup, before);
      expect(diffStates(initial, before, 0, new Set(["logic.frame"]))).toEqual([]);
      let state: CpuJumpState = { sim: initial, pilot };
      const failures: string[] = [];
      let compared = 0;
      for (let guard = 0; guard < 5000 && cpuJumpRunning(state, setup); guard++) {
        state = stepCpuFrame(state, setup);
        const snap = byFrame.get(state.sim.logic.frame + 1);
        if (!snap) continue;
        compared++;
        const want = {
          logic: decodeLogic(snap.view),
          jumper: decodeJumperState(snap.view),
          pose: decodePose(snap.view),
          wind: decodeWind(snap.view),
          seed: decodeRandSeed(snap.view),
        };
        const s = state.sim;
        const got = { logic: s.logic, jumper: s.jumper, pose: s.pose, wind: s.wind, seed: s.randomSeed };
        const bad = diffStates(got, want, JUMP_REL_TOLERANCE, new Set(["logic.frame"]));
        if (bad.length > 0 && failures.length < 4) {
          failures.push(`frame ${s.logic.frame} phase ${s.logic.phase}: ${bad.join("; ")}`);
        }
      }
      expect(compared).toBeGreaterThan(500);
      expect(failures).toEqual([]);
      // The state when the loop ends. A jump computed without drawing ends in the frame of its last step. A
      // watched one shows its result in frames without a step until a click (0baf:d16a..d1ba), so its last
      // frame tells when the capture clicked, not what the jump did.
      const final = {
        logic: decodeLogic(end.view),
        jumper: decodeJumperState(end.view),
        pose: decodePose(end.view),
        wind: decodeWind(end.view),
        seed: decodeRandSeed(end.view),
      };
      const s = state.sim;
      const got = { logic: s.logic, jumper: s.jumper, pose: s.pose, wind: s.wind, seed: s.randomSeed };
      expect(diffStates(got, final, JUMP_REL_TOLERANCE, new Set(["logic.frame"]))).toEqual([]);
      expect(setup.presentation ? end.frame >= s.logic.frame : end.frame === s.logic.frame).toBe(true);
      expect(s.logic.distanceM.toFixed(2)).toBe(final.logic.distanceM.toFixed(2));
      expect(s.logic.judges.map((j) => j.note)).toEqual(final.logic.judges.map((j) => j.note));
      expect(s.logic.points).toBe(final.logic.points);
    });
  }
});
