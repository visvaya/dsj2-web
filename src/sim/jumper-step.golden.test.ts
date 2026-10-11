import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stepJumper, type JumperState } from "./jumper-step";
import { TRACE_POINT, decodeHill, decodeJumperControls, decodeJumperState, readTrace } from "./test-support/dsj-trace";

const tracePath = process.env.DSJ2_TRACE ?? "";
const haveTrace = tracePath !== "" && existsSync(tracePath);

/** Relative tolerance: the original keeps x87 80-bit intermediates, this port uses doubles. */
const REL_TOLERANCE = 1e-6;

function compare(got: JumperState, want: JumperState): string[] {
  const bad: string[] = [];
  for (const key of Object.keys(want) as (keyof JumperState)[]) {
    const a = got[key];
    const e = want[key];
    if (typeof e === "boolean") {
      if (a !== e) bad.push(`${key}: ${String(a)} != ${String(e)}`);
      continue;
    }
    const diff = Math.abs((a as number) - e);
    if (diff > REL_TOLERANCE * Math.max(1, Math.abs(e))) bad.push(`${key}: ${String(a)} != ${String(e)}`);
  }
  return bad;
}

describe.skipIf(!haveTrace)("jumper step against the original game trace", () => {
  it("reproduces every frame from the entry snapshot", () => {
    const snaps = readTrace(tracePath);
    const entries = snaps.filter((s) => s.point === TRACE_POINT.jumperStep);
    const exits = new Map(snaps.filter((s) => s.point === TRACE_POINT.readInput).map((s) => [s.frame, s]));
    let exact = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      const exit = exits.get(entry.frame);
      if (!exit) continue;
      const got = stepJumper(decodeJumperState(entry.view), decodeJumperControls(entry.view), decodeHill(entry.view));
      const want = decodeJumperState(exit.view);
      const bad = compare(got, want);
      if (bad.length === 0) {
        exact += Object.keys(want).every((k) => got[k as keyof JumperState] === want[k as keyof JumperState]) ? 1 : 0;
      } else if (failures.length < 10) {
        failures.push(`frame ${entry.frame}: ${bad.join(", ")}`);
      }
    }
    console.info(`jumper step: ${entries.length} frames, ${exact} bit-exact`);
    expect(entries.length).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  });
});
