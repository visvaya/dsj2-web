import { generateHill, type GeneratedHill, type GeneratorOptions, type HillCharacter } from "../hill-generator";

/**
 * The generated set: hills of many sizes and shapes made by the generator, for training the player and for tests.
 * Sizes from K50 to K185 (the largest the scene holds with an outrun), several shapes per size: steep and gentle
 * landing hills, short and long landing areas, short, medium and long knolls, gentle and steep inruns, low and high
 * takeoff angles. None of them is a hill of the game; adding one to the hill list is a separate decision.
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
 * Generates the characters in order, each checked against the own hills and the hills generated before it, so no
 * two hills of the set are the same hill. `checkPlay` as in `generateHill`.
 */
export function generatedHillSet(
  characters: readonly HillCharacter[] = GENERATED_HILL_CHARACTERS,
  checkPlay: GeneratorOptions["checkPlay"] = true,
): GeneratedHill[] {
  const done: GeneratedHill[] = [];
  for (const character of characters) {
    done.push(generateHill(character, SET_SEED, { others: done.map((d) => d.spec), checkPlay }));
  }
  return done;
}
