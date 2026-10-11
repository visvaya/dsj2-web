import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detAtan, detCos, detExp, detSin } from "./deterministic-math";

/** Small deterministic generator for test inputs (xorshift32). */
function* inputs(count: number, lo: number, hi: number): Generator<number> {
  let s = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    yield lo + ((s >>> 0) / 0x100000000) * (hi - lo);
  }
}

function ulpDistance(a: number, b: number): number {
  const view = new DataView(new ArrayBuffer(16));
  view.setFloat64(0, a);
  view.setFloat64(8, b);
  const ia = view.getBigInt64(0);
  const ib = view.getBigInt64(8);
  const d = ia - ib;
  return Number(d < 0n ? -d : d);
}

const cases = [
  { name: "sin", det: detSin, ref: Math.sin, ranges: [[-0.8, 0.8], [-10, 10], [-1000, 1000]] },
  { name: "cos", det: detCos, ref: Math.cos, ranges: [[-0.8, 0.8], [-10, 10], [-1000, 1000]] },
  { name: "atan", det: detAtan, ref: Math.atan, ranges: [[-0.5, 0.5], [-3, 3], [-1e6, 1e6]] },
  { name: "exp", det: detExp, ref: Math.exp, ranges: [[-0.4, 0.4], [-5, 5], [-700, 700]] },
] as const;

describe("deterministic math", () => {
  for (const c of cases) {
    it(`${c.name} stays within 1 ulp of the engine and reports exact matches`, () => {
      let exact = 0;
      let total = 0;
      let worst = 0;
      for (const [lo, hi] of c.ranges) {
        for (const x of inputs(20000, lo, hi)) {
          const d = ulpDistance(c.det(x), c.ref(x));
          worst = Math.max(worst, d);
          exact += d === 0 ? 1 : 0;
          total++;
        }
      }
      console.info(`${c.name}: ${exact}/${total} identical to Math.${c.name}, worst ${worst} ulp`);
      expect(worst).toBeLessThanOrEqual(1);
    });
  }

  it("handles special values", () => {
    expect(detSin(0)).toBe(0);
    expect(Object.is(detSin(-0), -0)).toBe(true);
    expect(detCos(0)).toBe(1);
    expect(detExp(0)).toBe(1);
    // fdlibm exp(1) is one ulp above Math.E; V8 returns the same value.
    expect(Math.abs(detExp(1) - Math.E)).toBeLessThanOrEqual(Number.EPSILON * 2);
    expect(detAtan(Number.POSITIVE_INFINITY)).toBe(Math.PI / 2);
    expect(detAtan(1)).toBe(Math.PI / 4);
    expect(detExp(-1000)).toBe(0);
    expect(detExp(1000)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(detSin(Number.NaN))).toBe(true);
    expect(() => detSin(1e9)).toThrow(RangeError);
  });

  it("is the only place in src/sim that calls engine trigonometry or exp", () => {
    const dir = new URL(".", import.meta.url).pathname;
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && entry.name !== "deterministic-math.ts") {
          if (/Math\.(sin|cos|tan|atan|atan2|exp|log|pow|asin|acos|sinh|cosh|tanh|cbrt|hypot)\b/.test(readFileSync(path, "utf8"))) {
            offenders.push(path);
          }
        }
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });
});
