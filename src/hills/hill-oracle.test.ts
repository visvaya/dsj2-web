import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { FAILED_JUMP_SCORE_POINTS, jumpScore, ORACLE_SEARCH, oracleJump } from "./hill-oracle";
import { EXACT_PLAYER_LEVEL, playJump } from "./hill-players";
import { TRAINED_PLAYER_POLICY } from "./player-policy";

const [training] = OWN_HILLS;
if (training === undefined) throw new Error("no own hill");

/** One oracle search is up to 60 jumps, about 0.5 s alone. */
const ORACLE_TIMEOUT_MS = 60_000;

describe("hill oracle", () => {
  it(
    "never scores below the trained player's jump it starts from, within its jump budget, the same way twice",
    () => {
      const seed = 138;
      const player = playJump(training, seed, EXACT_PLAYER_LEVEL, seed);
      const best = oracleJump(training, seed);
      expect(best.score).toBeGreaterThanOrEqual(jumpScore(player));
      expect(best.score).toBe(jumpScore(best.outcome));
      expect(best.jumps).toBeLessThanOrEqual(ORACLE_SEARCH.maxJumps);
      expect(oracleJump(training, seed)).toEqual(best);
    },
    ORACLE_TIMEOUT_MS,
  );

  it("starts from the trained player's jump: no change scores what the player scores", () => {
    const seed = 14;
    const one = oracleJump(training, seed, TRAINED_PLAYER_POLICY, { ...ORACLE_SEARCH, maxJumps: 1 });
    expect(one.jumps).toBe(1);
    expect(one.choice).toEqual({ aimShiftFrames: 0, leanShiftsRad: [0, 0, 0, 0], landingShiftM: 0 });
    expect(one.outcome.finalHash).toBe(playJump(training, seed, EXACT_PLAYER_LEVEL, seed).finalHash);
  });

  it("scores a fall or a disqualification below any clean jump", () => {
    const clean = playJump(training, 1, EXACT_PLAYER_LEVEL, 1);
    expect(jumpScore(clean)).toBe(clean.points);
    expect(jumpScore({ ...clean, fell: true })).toBe(FAILED_JUMP_SCORE_POINTS);
    expect(jumpScore({ ...clean, disqualified: true })).toBe(FAILED_JUMP_SCORE_POINTS);
    expect(FAILED_JUMP_SCORE_POINTS).toBeLessThan(clean.points);
  });
});
