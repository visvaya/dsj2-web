/**
 * The player's outfit as in the original's team colour editor (Dsj.dat texts "Spodnie", "Rękawy",
 * "Rękawice", "Kask", "Narty"): one of 12 colours per part, by index.
 */
export const OUTFIT_PARTS = ["pants", "sleeves", "gloves", "helmet", "skis"] as const;
export type OutfitPart = (typeof OUTFIT_PARTS)[number];
export type Outfit = Readonly<Record<OutfitPart, number>>;

/** Number of colours in the original editor's palette (see OUTFIT_SWATCHES in render/palette). */
export const OUTFIT_COLOR_COUNT = 12;

/** "Drużyna gracza 1" in the original: violet suit and sleeves, black gloves, blue helmet, brown skis. */
export const DEFAULT_OUTFIT: Outfit = { pants: 8, sleeves: 8, gloves: 0, helmet: 9, skis: 4 };

/** Reads an outfit from stored data, keeping the default for any part that is missing or out of range. */
export function parseOutfit(v: unknown): Outfit {
  const read = (part: OutfitPart): number => {
    const value: unknown = typeof v === "object" && v !== null ? Reflect.get(v, part) : undefined;
    return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < OUTFIT_COLOR_COUNT
      ? value
      : DEFAULT_OUTFIT[part];
  };
  return {
    pants: read("pants"),
    sleeves: read("sleeves"),
    gloves: read("gloves"),
    helmet: read("helmet"),
    skis: read("skis"),
  };
}
