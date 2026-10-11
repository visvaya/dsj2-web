/**
 * Borland Pascal 7 `Random` (System unit). The game draws all randomness
 * (wind, flight noise) from it and replays store its seed, so the sequence
 * must match exactly: seed := seed * $08088405 + 1, Random(n) = seed * n shr 32.
 */
export const RANDSEED_MULTIPLIER = 0x08088405;

export class BorlandRandom {
  private seedU32: number;

  constructor(seed: number) {
    this.seedU32 = seed >>> 0;
  }

  get seed(): number {
    return this.seedU32;
  }

  set seed(value: number) {
    this.seedU32 = value >>> 0;
  }

  private step(): number {
    this.seedU32 = (Math.imul(this.seedU32, RANDSEED_MULTIPLIER) + 1) >>> 0;
    return this.seedU32;
  }

  /** Random(n) for an unsigned 16-bit n: an integer in 0..n-1 (0 when n is 0). */
  below(n: number): number {
    const seed = this.step();
    const range = n & 0xffff;
    // 32x16-bit product split so that it stays exact in doubles.
    const high = (seed >>> 16) * range;
    const low = (seed & 0xffff) * range;
    return Math.floor((high + Math.floor(low / 0x10000)) / 0x10000);
  }
}
