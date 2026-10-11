import type { Scenery } from "../render/jump-view";
import type { SceneryChoice } from "../storage/save-data";

/** Share of visits that get night (when varied) and, separately, snowfall. */
export const NIGHT_CHANCE = 1 / 3;
export const SNOWFALL_CHANCE = 1 / 3;

/** Two independent uniform values in 0..1 from one 32-bit seed (purely visual; not the simulation's generator). */
function unitPair(seed: number): [number, number] {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return [(h & 0xffff) / 0x10000, (h >>> 16) / 0x10000];
}

/** Look of a visit to a hill: the chosen time of day (or a random one), and snowfall now and then. */
export function pickScenery(choice: SceneryChoice, seed: number): Scenery {
  const [timeRoll, snowRoll] = unitPair(seed);
  const night = choice === "night" || (choice === "varied" && timeRoll < NIGHT_CHANCE);
  return { lighting: night ? "night" : "day", snowfall: snowRoll < SNOWFALL_CHANCE };
}
