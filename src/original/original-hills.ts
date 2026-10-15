import type { HillLook } from "../render/hill-look";
import { buildHillProfile } from "../sim/hill-setup";
import type { HillProfile } from "../sim/hill-profile";
import { HILL_NAME_TEXT_BASE, TEXT_RESOURCE_ID, readResource, readText } from "./dsj-dat";
import { readHillLook } from "./hill-look-reader";
import { readHillTable, type HillDefinition } from "./hill-table";
import { readMzImage } from "./mz-image";

/** A hill of the original game, read from the player's own copy. */
export interface OriginalHill {
  number: number;
  /** Name shown by the game (Dsj.dat), or null without the resource file. */
  name: string | null;
  kPointM: number;
  profile: HillProfile;
  /** How the hill looks besides its profile (sky, background, inrun, fences, marks); null if it cannot be read. */
  look: HillLook | null;
  definition: HillDefinition;
}

/**
 * Reads all hills from the player's Dsj.exe and, when given, their names from
 * Dsj.dat. Nothing of the original game is bundled with this project.
 */
export function readOriginalHills(exe: Uint8Array, dat?: Uint8Array): OriginalHill[] {
  const table = readHillTable(readMzImage(exe).image);
  const texts = dat ? readResource(dat, TEXT_RESOURCE_ID) : null;
  return table.map((definition) => ({
    number: definition.number,
    name: texts ? readText(texts, HILL_NAME_TEXT_BASE + definition.number) : null,
    kPointM: definition.kPointM,
    profile: buildHillProfile(definition.inrun, definition.landing),
    look: readHillLook(definition),
    definition,
  }));
}
