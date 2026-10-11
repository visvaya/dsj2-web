import { describe, expect, it } from "vitest";
import { BorlandRandom } from "./borland-random";
import { TRACE_POINT, decodeFrame, decodeRandSeed, decodeWind, listTraces, readTrace } from "./test-support/dsj-trace";
import { updateWind } from "./wind";

const traces = listTraces();

describe.skipIf(traces.length === 0)("wind update against the original game traces", () => {
  for (const trace of traces) it(`${trace.name}: matches wind state and random seed bit for bit`, () => {
    const snaps = readTrace(trace.path);
    const exits = new Map(snaps.filter((s) => s.point === TRACE_POINT.jumperStep).map((s) => [s.frame, s]));
    const entries = snaps.filter((s) => s.point === TRACE_POINT.windUpdate);
    const failures: string[] = [];
    let updates = 0;
    for (const entry of entries) {
      const exit = exits.get(entry.frame);
      if (!exit) continue;
      const rng = new BorlandRandom(decodeRandSeed(entry.view));
      const before = decodeWind(entry.view);
      const got = updateWind(before, decodeFrame(entry.view), entry.view.getFloat32(0x14ee, true), rng);
      if (got !== before) updates++;
      const want = decodeWind(exit.view);
      if (JSON.stringify(got) !== JSON.stringify(want) || rng.seed !== decodeRandSeed(exit.view)) {
        failures.push(`frame ${entry.frame}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
      }
    }
    expect(entries.length).toBeGreaterThan(500);
    expect(updates).toBeGreaterThan(50);
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
