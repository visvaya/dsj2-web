import { describe, expect, it } from "vitest";
import { BorlandRandom, RANDSEED_MULTIPLIER } from "./borland-random";

/** Straightforward BigInt model of the Pascal routine, used as the oracle. */
function referenceSequence(seed: number, ranges: number[]): { values: number[]; seed: number } {
  let s = BigInt(seed >>> 0);
  const values = ranges.map((n) => {
    s = (s * BigInt(RANDSEED_MULTIPLIER) + 1n) & 0xffffffffn;
    return Number((s * BigInt(n & 0xffff)) >> 32n);
  });
  return { values, seed: Number(s) };
}

describe("BorlandRandom", () => {
  it("advances the seed like RandSeed := RandSeed * $08088405 + 1", () => {
    const rng = new BorlandRandom(0);
    rng.below(1);
    expect(rng.seed).toBe(1);
    rng.below(1);
    expect(rng.seed).toBe(RANDSEED_MULTIPLIER + 1);
  });

  it("matches the BigInt reference for many seeds and ranges", () => {
    const ranges = [1, 2, 5, 10, 30, 60, 100, 256, 0x8000, 0xffff];
    for (const seed of [0, 1, 0x2f4b0829, 0x26b51b17, 0xffffffff, 0x80000000]) {
      const rng = new BorlandRandom(seed);
      const want = referenceSequence(seed, [...ranges, ...ranges, ...ranges]);
      const got = [...ranges, ...ranges, ...ranges].map((n) => rng.below(n));
      expect(got).toEqual(want.values);
      expect(rng.seed).toBe(want.seed);
    }
  });

  it("returns 0 for Random(0) and stays below n", () => {
    const rng = new BorlandRandom(12345);
    expect(rng.below(0)).toBe(0);
    for (let i = 0; i < 1000; i++) {
      expect(rng.below(7)).toBeLessThan(7);
    }
  });
});
