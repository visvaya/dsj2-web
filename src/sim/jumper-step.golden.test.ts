import { describe, expect, it } from "vitest";
import { stepJumper, type JumperState } from "./jumper-step";
import { TRACE_POINT, decodeHill, decodeJumperControls, decodeJumperState, listTraces, readTrace } from "./test-support/dsj-trace";

const traces = listTraces();

/** Relative tolerance: the original keeps x87 80-bit intermediates, this port uses doubles. */
const REL_TOLERANCE = 1e-6;

function isStateKey(state: JumperState, key: string): key is keyof JumperState {
  return key in state;
}

function compare(got: JumperState, want: JumperState): { bad: string[]; exact: boolean } {
  const bad: string[] = [];
  let exact = true;
  for (const key of Object.keys(want)) {
    if (!isStateKey(want, key)) continue;
    const a = got[key];
    const e = want[key];
    if (a !== e) exact = false;
    if (typeof a === "number" && typeof e === "number") {
      if (Math.abs(a - e) > REL_TOLERANCE * Math.max(1, Math.abs(e))) bad.push(`${key}: ${a} != ${e}`);
    } else if (a !== e) {
      bad.push(`${key}: ${String(a)} != ${String(e)}`);
    }
  }
  return { bad, exact };
}

describe.skipIf(traces.length === 0)("jumper step against the original game traces", () => {
  for (const trace of traces) it(`${trace.name}: reproduces every frame from the entry snapshot`, () => {
    const snaps = readTrace(trace.path);
    const entries = snaps.filter((s) => s.point === TRACE_POINT.jumperStep);
    const exits = new Map(snaps.filter((s) => s.point === TRACE_POINT.readInput).map((s) => [s.frame, s]));
    let exact = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      const exit = exits.get(entry.frame);
      if (!exit) continue;
      const got = stepJumper(decodeJumperState(entry.view), decodeJumperControls(entry.view), decodeHill(entry.view));
      const want = decodeJumperState(exit.view);
      const { bad, exact: bitExact } = compare(got, want);
      if (bad.length === 0) {
        exact += bitExact ? 1 : 0;
      } else if (failures.length < 10) {
        failures.push(`frame ${entry.frame}: ${bad.join(", ")}`);
      }
    }
    console.info(`${trace.name} jumper step: ${entries.length} frames, ${exact} bit-exact`);
    expect(entries.length).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  });
});
