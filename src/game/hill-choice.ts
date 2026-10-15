import type { HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import type { OriginalHill } from "../original/original-hills";
import type { CountryCode } from "../render/flags";
import { DEFAULT_HILL_LOOK, type HillLook } from "../render/hill-look";
import { UI_TEXT } from "../text/ui-text";

/** A hill the player can pick, from this project or from the player's original files. */
export interface HillChoice {
  id: string;
  name: string;
  kPointM: number;
  profile: HillProfile;
  /** How the hill looks besides its profile. */
  look: HillLook;
  source: "own" | "original";
  /** Country the hill stands in, for its flag; none for this project's own hills. */
  country: CountryCode | null;
}

/** Hills made for this project (not taken from the original game). */
export const OWN_HILLS: readonly HillChoice[] = [
  {
    id: "own-1",
    name: "Ćwiczebna",
    kPointM: 90,
    source: "own",
    country: null,
    look: DEFAULT_HILL_LOOK,
    profile: buildHillProfile(
      {
        startXM: 11.4,
        flatEndXM: 10,
        lineEndXM: 32,
        takeoffXM: 44,
        lineSlope: -0.9,
        lineInterceptM: 230,
        curveA: 0.0296,
      },
      {
        centerXM: 95,
        centerYM: 166,
        amplitudeM: 30,
        widthM: 40,
        outrunStartXM: 160,
        outrunCurveA: 0.012,
        knollBlend: 0,
      },
    ),
  },
];

/**
 * Country of each hill of v2.10P by its number: 1-32 are named after countries (in this order in Dsj.dat),
 * 33-37 are Polish hills (Zakopane 1 and 2, Karpacz, Wisła, Szczyrk). By number, not by name, because
 * the names come from the player's file and differ between language versions.
 */
// oxfmt-ignore
export const ORIGINAL_HILL_COUNTRY: readonly CountryCode[] = [
  "FI", "CH", "CZ", "BY", "AT", "US", "LV", "PL", "JP", "BE", "IS", "ENG", "DE", "EE", "NO", "AU",
  "IE", "UA", "HU", "SE", "IT", "DK", "SK", "CA", "LT", "KZ", "CN", "FR", "NL", "RU", "KR", "SI",
  "PL", "PL", "PL", "PL", "PL",
];

/** Names of hills 33-37 (Polish hills); hills 1-32 are named after their country. */
const POLISH_HILL_NAMES: readonly string[] = ["Zakopane 1", "Zakopane 2", "Karpacz", "Wisła", "Szczyrk"];

/**
 * Name of an original hill when Dsj.dat is not loaded: the same names the Polish v2.10P stores there
 * (checked against the file in the golden test), so the .dat file is optional.
 */
export function fallbackHillName(number: number): string {
  const country = ORIGINAL_HILL_COUNTRY[number - 1];
  if (number <= 32 && country !== undefined) return UI_TEXT.flags.countryName[country];
  return POLISH_HILL_NAMES[number - 33] ?? `Skocznia ${number}`;
}

/** The id under which a hill of the original, by its number (1 to 37), is offered. */
export const originalHillId = (hillNumber: number): string => `original-${hillNumber}`;

/** The number of a hill of the original from its id; null for any other hill. */
export function originalHillNumber(id: string): number | null {
  const match = /^original-([1-9]\d?)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function originalHillChoices(hills: readonly OriginalHill[]): HillChoice[] {
  return hills.map((h) => ({
    id: originalHillId(h.number),
    name: h.name ?? fallbackHillName(h.number),
    kPointM: h.kPointM,
    profile: h.profile,
    look: h.look ?? DEFAULT_HILL_LOOK,
    source: "original",
    country: ORIGINAL_HILL_COUNTRY[h.number - 1] ?? null,
  }));
}
