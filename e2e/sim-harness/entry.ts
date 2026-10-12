import { REGRESSION_SCENARIOS, runRegressionScenario } from "../../src/sim/test-support/regression-scenarios";

/**
 * Runs the regression scenarios of the simulation in the page that loads this script and leaves the results in
 * the document as JSON. Bundled by the browser tests only; it is not part of the game.
 */
const results = REGRESSION_SCENARIOS.map((scenario) => ({
  name: scenario.name,
  result: runRegressionScenario(scenario),
}));

const output = document.createElement("pre");
// The same id as HARNESS_RESULTS_ID in paths.ts, which imports Node modules and cannot be bundled for a page.
output.id = "sim-results";
output.textContent = JSON.stringify(results);
document.body.append(output);
