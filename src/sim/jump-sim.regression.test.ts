import { describe, expect, it } from "vitest";
import { ORIGINAL_POSES } from "./data/pose-table";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "./jump-sim";
import { calmWind, makeBot, stateHash, syntheticHill, type BotOptions } from "./test-support/synthetic";

/**
 * Regression tests on a made-up hill with scripted input. The expected values
 * were produced by this simulation after it matched the original game frame
 * for frame (see *.golden.test.ts); they guard against unintended changes in
 * CI, where the original game files are not available.
 */

interface Scenario {
  name: string;
  seed: number;
  windOffset: number;
  bot: BotOptions;
}

const gentleLean = (frame: number) => ((frame * 7) % 9) - 4;

const SCENARIOS: Scenario[] = [
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

function run(sc: Scenario) {
  const hill = syntheticHill();
  const setup: JumpSetup = {
    hill,
    kPointM: 90,
    poses: ORIGINAL_POSES,
    wind: calmWind(sc.windOffset),
    randomSeed: sc.seed,
    points: 0,
    presentation: true,
  };
  let state: JumpSimState = createJump(setup);
  const input = makeBot(hill, sc.bot, () => state);
  let hash = 0x811c9dc5;
  for (let guard = 0; guard < 6000 && jumpRunning(state); guard++) {
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

describe("jump simulation regression on a synthetic hill", () => {
  it.each(SCENARIOS)("$name", (sc) => {
    expect(run(sc)).toMatchSnapshot();
  });
});
