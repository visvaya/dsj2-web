import { OWN_HILL_SPECS } from "../own-hills";
import { generateHill, type GeneratedHill, type GeneratorOptions, type HillCharacter } from "../hill-generator";

/**
 * The generated set: hills of many sizes and shapes made by the generator, for training the player and for tests.
 * Sizes from K50 to K185 (the largest the construction fits in the scene), several shapes per size: steep and gentle
 * landing hills, short and long landing areas, short, medium and long knolls, gentle and steep inruns, low and high
 * takeoff angles. Those in the game are listed in SET_HILLS_IN_GAME.
 */
export const GENERATED_HILL_CHARACTERS: readonly HillCharacter[] = [
  {
    kPointM: 50,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.3,
    knoll: "long",
    inrunSteepnessDeg: 35,
    takeoffAngleDeg: 11,
    look: "winter",
  },
  {
    kPointM: 50,
    landingSteepnessDeg: 36,
    landingAreaPastKShare: 0.22,
    knoll: "medium",
    inrunSteepnessDeg: 30,
    takeoffAngleDeg: 10,
    look: "day",
  },
  {
    kPointM: 65,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 33,
    takeoffAngleDeg: 10,
    look: "dusk",
  },
  {
    kPointM: 75,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.22,
    knoll: "long",
    inrunSteepnessDeg: 30,
    takeoffAngleDeg: 11,
    look: "winter",
  },
  {
    kPointM: 75,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.3,
    knoll: "short",
    inrunSteepnessDeg: 38,
    takeoffAngleDeg: 9,
    look: "day",
  },
  {
    kPointM: 90,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.32,
    knoll: "medium",
    inrunSteepnessDeg: 40,
    takeoffAngleDeg: 8,
    look: "dusk",
  },
  {
    kPointM: 105,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.22,
    knoll: "medium",
    inrunSteepnessDeg: 36,
    takeoffAngleDeg: 10,
    look: "day",
  },
  {
    kPointM: 105,
    landingSteepnessDeg: 40,
    landingAreaPastKShare: 0.28,
    knoll: "short",
    inrunSteepnessDeg: 42,
    takeoffAngleDeg: 9,
    look: "winter",
  },
  {
    kPointM: 120,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.2,
    knoll: "short",
    inrunSteepnessDeg: 40,
    takeoffAngleDeg: 10,
    look: "day",
  },
  {
    kPointM: 120,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.3,
    // With a medium knoll this hill failed the wind spread rule (10.8 m on K120, the rule allows 9.6 m).
    knoll: "short",
    inrunSteepnessDeg: 38,
    takeoffAngleDeg: 11,
    look: "dusk",
  },
  {
    kPointM: 135,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 40,
    takeoffAngleDeg: 10,
    look: "winter",
  },
  {
    kPointM: 140,
    landingSteepnessDeg: 36,
    landingAreaPastKShare: 0.3,
    knoll: "long",
    inrunSteepnessDeg: 42,
    takeoffAngleDeg: 8,
    look: "dusk",
  },
  {
    kPointM: 150,
    landingSteepnessDeg: 40,
    landingAreaPastKShare: 0.25,
    knoll: "short",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 9,
    look: "day",
  },
  {
    kPointM: 160,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.18,
    knoll: "long",
    inrunSteepnessDeg: 42,
    takeoffAngleDeg: 11,
    look: "winter",
  },
  {
    kPointM: 170,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 10,
    look: "dusk",
  },
  {
    kPointM: 185,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.2,
    knoll: "short",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 10,
    look: "day",
  },
];

/** Seed of the scenery of every generated hill of the set. */
const SET_SEED = 1;

/**
 * Hills of the set that are in the game, by their id in the set: the own hill with the same profile and K point
 * and its own scenery. The set leaves those own hills out of its likeness checks, since they are its own hills.
 */
export const SET_HILLS_IN_GAME: Readonly<Record<string, string>> = {
  "gen-k50-l390-a30-l-i350-t110-winter1": "own-4",
  "gen-k50-l360-a22-m-i300-t100-day1": "own-5",
  "gen-k65-l370-a20-m-i330-t100-dusk1": "own-6",
  "gen-k75-l370-a22-l-i300-t110-winter1": "own-7",
  "gen-k75-l390-a30-s-i380-t90-day1": "own-8",
  "gen-k90-l370-a32-m-i400-t80-dusk1": "own-9",
  "gen-k105-l380-a22-m-i360-t100-day1": "own-10",
  "gen-k105-l400-a28-s-i420-t90-winter1": "own-11",
  "gen-k120-l390-a20-s-i400-t100-day1": "own-12",
  "gen-k120-l380-a30-s-i380-t110-dusk1": "own-13",
};

/**
 * Generates the characters in order, each checked against the own hills not taken from the set and the hills
 * generated before it, so no two hills of the set are the same hill. `checkPlay` as in `generateHill`.
 */
export function generatedHillSet(
  characters: readonly HillCharacter[] = GENERATED_HILL_CHARACTERS,
  checkPlay: GeneratorOptions["checkPlay"] = true,
): GeneratedHill[] {
  const inGame = new Set(Object.values(SET_HILLS_IN_GAME));
  const catalog = OWN_HILL_SPECS.filter((spec) => !inGame.has(spec.id));
  const done: GeneratedHill[] = [];
  for (const character of characters) {
    done.push(generateHill(character, SET_SEED, { others: done.map((d) => d.spec), catalog, checkPlay }));
  }
  return done;
}
