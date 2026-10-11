import type { Scenery } from "../render/jump-view";
import type { SceneryChoice } from "../storage/save-data";

/** With a varied choice: share of visits at night and at dusk (the rest by day). */
export const NIGHT_CHANCE = 1 / 4;
export const DUSK_CHANCE = 1 / 4;
/** Weather, drawn independently of the time of day. */
export const SNOWFALL_CHANCE = 1 / 3;
export const FOG_CHANCE = 1 / 5;

/** A uniform value in 0..1 from a 32-bit seed and a salt (purely visual; not the simulation's generator). */
function unit(seed: number, salt: number): number {
  let h = Math.imul((seed ^ Math.imul(salt, 0x27d4eb2d)) >>> 0 ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}

/** Look of a visit to a hill: the chosen time of day (or a random one), and now and then snowfall or fog. */
export function pickScenery(choice: SceneryChoice, seed: number): Scenery {
  const time = unit(seed, 1);
  const lighting =
    choice !== "varied" ? choice : time < NIGHT_CHANCE ? "night" : time < NIGHT_CHANCE + DUSK_CHANCE ? "dusk" : "day";
  return { lighting, snowfall: unit(seed, 2) < SNOWFALL_CHANCE, fog: unit(seed, 3) < FOG_CHANCE };
}
