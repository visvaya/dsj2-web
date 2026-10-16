import type { HillChoice } from "../../game/hill-choice";
import {
  AIM_RANGE_FRAMES,
  aimSweepOf,
  EXACT_PLAYER_LEVEL,
  playJump,
  withAimFrames,
  type AimSweep,
} from "../hill-players";
import { TRAINED_PLAYER_POLICY } from "../player-policy";

/** Tries every takeoff aim of `AIM_RANGE_FRAMES` once per jump seed: the reference the aim search must equal. */
export function fullAimSweep(hill: HillChoice, seeds: readonly number[], toleranceM: number): AimSweep[] {
  const aims = Array.from(
    { length: AIM_RANGE_FRAMES.to - AIM_RANGE_FRAMES.from + 1 },
    (_, i) => AIM_RANGE_FRAMES.from + i,
  );
  return seeds.map((seed) =>
    aimSweepOf(
      aims.map((aim) => ({
        aim,
        outcome: playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, withAimFrames(TRAINED_PLAYER_POLICY, aim)),
      })),
      toleranceM,
    ),
  );
}
