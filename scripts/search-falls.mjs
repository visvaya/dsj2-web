// Searches this project's simulation for inputs that end in each kind of fall (types 1 to
// 5): every input pattern on every hill read from the player's Dsj.exe. Prints how often
// each kind was reached and writes the plan of one representative case per kind as
// <out-dir>/FALLn.json, for tools/re/craft_replays.py (see docs/testing.md).
// Usage: node scripts/search-falls.mjs <game-dir> <out-dir>   (writes only into <out-dir>)
import { readGameFiles } from "./lib/game-files.mjs";
import { loadTypeScript } from "./lib/load-typescript.mjs";
import { writePlanFiles } from "./lib/plan-files.mjs";

async function main(args) {
  const [gameDir, outDir] = args;
  if (gameDir === undefined || outDir === undefined || args.length !== 2) {
    console.error("usage: node scripts/search-falls.mjs <game-dir> <out-dir>");
    return 1;
  }
  const { exe, dat } = readGameFiles(gameDir);
  const { searchOriginalFalls, formatFallSearch } = await loadTypeScript("src/original/test-support/fall-search.ts");
  const search = searchOriginalFalls(exe, dat);
  console.log(formatFallSearch(search));
  console.log(
    writePlanFiles(
      outDir,
      search.summaries.flatMap((summary) => summary.example ?? []),
    ),
  );
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`search-falls: ${String(error)}`);
  process.exitCode = 1;
}
