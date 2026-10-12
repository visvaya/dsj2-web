import { describe, expect, it } from "vitest";
import { TRACE_POINT, decodeLogic, decodePose, readTrace } from "../sim/test-support/dsj-trace";
import { goldenTraces } from "../sim/test-support/golden-files";
import { POINT_COUNT, skeletonPoints } from "./jumper-skeleton";

const golden = goldenTraces();
/** The original stores the 21 points (z, x, y Singles) from DS:4456 on. */
const POINTS_BASE = 0x444a;

describe.skipIf(!golden.requested)("jumper figure against the original", () => {
  it("has the traces it was asked to compare", () => {
    expect(golden.problems).toEqual([]);
  });

  for (const trace of golden.traces) {
    it(`${trace.name}: skeleton points match the stored ones`, () => {
      const snaps = readTrace(trace.path).filter((s) => s.point === TRACE_POINT.windUpdate);
      let compared = 0;
      let worst = 0;
      let worstAt = "";
      for (const snap of snaps) {
        const v = snap.view;
        const pts = skeletonPoints(decodePose(v), decodeLogic(v).frontLeg);
        for (let i = 1; i <= POINT_COUNT; i++) {
          const base = POINTS_BASE + 12 * i;
          const want = [v.getFloat32(base, true), v.getFloat32(base + 4, true), v.getFloat32(base + 8, true)];
          const p = pts[i];
          const got = p ? [p.z, p.x, p.y] : [Number.NaN, Number.NaN, Number.NaN];
          for (let c = 0; c < 3; c++) {
            const d = Math.abs((got[c] ?? 0) - (want[c] ?? 0));
            if (!(d <= worst)) {
              worst = d;
              worstAt = `frame ${snap.frame} point ${i} axis ${c}: ${got[c]} != ${want[c]}`;
            }
          }
        }
        compared++;
      }
      expect(compared).toBeGreaterThan(500);
      expect({ worst: worst < 1e-4, worstAt }).toEqual({ worst: true, worstAt });
    });
  }
});
