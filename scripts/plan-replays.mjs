// Writes replay plans for hills of the original game: this project's simulation plays an
// ordinary jump on each hill read from the player's Dsj.exe, and the input of that jump is
// stored as <out-dir>/HILLnn.json. tools/re/craft_replays.py turns a plan into a replay the
// original game can play (see docs/testing.md).
// Usage: node scripts/plan-replays.mjs <game-dir> <out-dir> [hill-number ...]
//        (all 37 hills when no number is given; writes only into <out-dir>)
import { readGameFiles } from "./lib/game-files.mjs";
import { loadTypeScript } from "./lib/load-typescript.mjs";
import { writePlanFiles } from "./lib/plan-files.mjs";

async function main(args) {
  const [gameDir, outDir, ...hillArgs] = args;
  const numbers = hillArgs.map(Number);
  if (gameDir === undefined || outDir === undefined || numbers.some((n) => !Number.isInteger(n)) === true) {
    console.error("usage: node scripts/plan-replays.mjs <game-dir> <out-dir> [hill-number ...]");
    return 1;
  }
  const { exe, dat } = readGameFiles(gameDir);
  const { planHills, formatPlans } = await loadTypeScript("src/original/test-support/hill-plans.ts");
  const files = planHills(exe, dat, numbers);
  console.log(formatPlans(files));
  console.log(writePlanFiles(outDir, files));
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`plan-replays: ${String(error)}`);
  process.exitCode = 1;
}
