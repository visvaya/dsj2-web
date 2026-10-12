import { fileURLToPath } from "node:url";

/** The page script that runs the regression scenarios, and where its bundle is written (ignored by git). */
export const HARNESS_ENTRY = fileURLToPath(new URL("./entry.ts", import.meta.url));
export const HARNESS_OUT_DIR = fileURLToPath(new URL("../.sim-harness/", import.meta.url));
export const HARNESS_FILE = "sim-harness.js";
export const HARNESS_BUNDLE = fileURLToPath(new URL(`../.sim-harness/${HARNESS_FILE}`, import.meta.url));
/** Id of the element the harness writes its results into, as JSON. */
export const HARNESS_RESULTS_ID = "sim-results";
/** The snapshot of the regression test that runs the same scenarios in Node. */
export const REGRESSION_SNAPSHOT = fileURLToPath(
  new URL("../../src/sim/__snapshots__/jump-sim.regression.test.ts.snap", import.meta.url),
);
