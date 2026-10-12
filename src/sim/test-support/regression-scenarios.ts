import { ORIGINAL_POSES } from "../data/pose-table";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../jump-sim";
import { calmWind, makeBot, stateHash, syntheticHill, type BotOptions } from "./synthetic";

/**
 * Whole jumps on a made-up hill with scripted input, shared by the regression test (Node) and by the run of the
 * same scenarios inside real browser engines. The simulation must give the same bits in all of them.
 */

export interface RegressionScenario {
  name: string;
  seed: number;
  windOffset: number;
  bot: BotOptions;
}

/** What one scenario leaves behind: the end of the jump and a hash over the state of every frame. */
export interface RegressionResult {
  frames: number;
  distanceM: number;
  points: number;
  notes: number[];
  fallType: number;
  hash: string;
}

/** A jump never takes this many frames; the limit only stops a simulation that does not end. */
export const REGRESSION_FRAME_LIMIT = 6000;

const gentleLean = (frame: number) => ((frame * 7) % 9) - 4;

export const REGRESSION_SCENARIOS: RegressionScenario[] = [
  {
    name: "clean telemark",
    seed: 0x1234_5678,
    windOffset: 0,
    bot: { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: gentleLean },
  },
  {
    name: "late takeoff, tail wind",
    seed: 0x0bad_cafe,
    windOffset: 8,
    bot: { startFrame: 90, takeoffLeadM: 0.8, landingHeightM: 1.2, leanPattern: () => -3 },
  },
  {
    name: "no landing (crash)",
    seed: 42,
    windOffset: 2,
    bot: { startFrame: 70, takeoffLeadM: 3, landingHeightM: null, leanPattern: gentleLean },
  },
];

export function regressionSetup(sc: RegressionScenario): JumpSetup {
  return {
    hill: syntheticHill(),
    kPointM: 90,
    poses: ORIGINAL_POSES,
    wind: calmWind(sc.windOffset),
    randomSeed: sc.seed,
    points: 0,
    presentation: true,
  };
}

export function runRegressionScenario(sc: RegressionScenario): RegressionResult {
  const setup = regressionSetup(sc);
  let state: JumpSimState = createJump(setup);
  const input = makeBot(setup.hill, sc.bot, () => state);
  let hash = 0x811c9dc5;
  for (let guard = 0; guard < REGRESSION_FRAME_LIMIT && jumpRunning(state); guard++) {
    state = stepFrame(state, setup, input);
    hash = stateHash(hash, state);
  }
  return {
    frames: state.logic.frame,
    distanceM: state.logic.distanceM,
    points: state.logic.points,
    notes: state.logic.judges.map((j) => j.note),
    fallType: state.logic.fallType,
    hash: hash.toString(16),
  };
}
