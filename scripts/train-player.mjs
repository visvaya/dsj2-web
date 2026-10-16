// Trains the player policy of the hill checks (src/hills/player-policy.ts) on the game's own
// hills and variants made from their data, and prints the trained numbers and their score, to
// be copied into TRAINED_PLAYER_POLICY. Deterministic: the same code gives the same numbers.
// Usage: node scripts/train-player.mjs [max-evaluations]   (default 400; writes nothing)
import { loadTypeScript } from "./lib/load-typescript.mjs";

const DEFAULT_MAX_EVALUATIONS = 400;

async function main(args) {
  const [limitArg] = args;
  const maxEvaluations = limitArg === undefined ? DEFAULT_MAX_EVALUATIONS : Number(limitArg);
  if (!Number.isInteger(maxEvaluations) || maxEvaluations < 1 || args.length > 1) {
    console.error("usage: node scripts/train-player.mjs [max-evaluations]");
    return 1;
  }
  const { runTraining } = await loadTypeScript("src/hills/test-support/player-training.ts");
  const started = performance.now();
  runTraining(maxEvaluations, (line) => console.log(line));
  console.log(`took ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`train-player: ${String(error)}`);
  process.exitCode = 1;
}
