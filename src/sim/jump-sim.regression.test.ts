import { describe, expect, it } from "vitest";
import { createJump, jumpRunning, stepFrame, type JumpSimState } from "./jump-sim";
import {
  REGRESSION_FRAME_LIMIT,
  REGRESSION_SCENARIOS,
  regressionSetup,
  runRegressionScenario,
} from "./test-support/regression-scenarios";
import { makeBot } from "./test-support/synthetic";

/**
 * Regression tests on a made-up hill with scripted input. The expected values
 * were produced by this simulation after it matched the original game frame
 * for frame (see *.golden.test.ts); they guard against unintended changes in
 * CI, where the original game files are not available. The scenarios live in
 * test-support/regression-scenarios.ts, because the browser tests run the same
 * ones in every engine and compare them with this test's snapshot.
 */

describe("jump simulation regression on a synthetic hill", () => {
  it.each(REGRESSION_SCENARIOS)("$name", (sc) => {
    expect(runRegressionScenario(sc)).toMatchSnapshot();
  });

  // The step routines write into a copy of the frame's state, as the original writes memory. Everything
  // outside the simulation relies on the previous state staying as it was.
  it.each(REGRESSION_SCENARIOS)("$name: a step never modifies the state it is given", (sc) => {
    const setup = regressionSetup(sc);
    let state: JumpSimState = createJump(setup);
    const input = makeBot(setup.hill, sc.bot, () => state);
    let frames = 0;
    for (let guard = 0; guard < REGRESSION_FRAME_LIMIT && jumpRunning(state); guard++) {
      const before = structuredClone(state);
      const next = stepFrame(state, setup, input);
      expect(state).toEqual(before);
      state = next;
      frames++;
    }
    expect(frames).toBeGreaterThan(500);
  });
});
