import type { HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import type { OriginalHill } from "../original/original-hills";
import type { CountryCode } from "../render/flags";

/** A hill the player can pick, from this project or from the player's original files. */
export interface HillChoice {
  id: string;
  name: string;
  kPointM: number;
  profile: HillProfile;
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
    profile: buildHillProfile(
      { startXM: 11.4, flatEndXM: 10, lineEndXM: 32, takeoffXM: 44, lineSlope: -0.9, lineInterceptM: 230, curveA: 0.0296 },
      { centerXM: 95, centerYM: 166, amplitudeM: 30, widthM: 40, outrunStartXM: 160, outrunCurveA: 0.012, knollBlend: 0 },
    ),
  },
];

/**
 * Country of each hill of v2.10P by its number: 1-32 are named after countries (in this order in Dsj.dat),
 * 33-37 are Polish hills (Zakopane 1 and 2, Karpacz, Wisła, Szczyrk). By number, not by name, because
 * the names come from the player's file and differ between language versions.
 */
export const ORIGINAL_HILL_COUNTRY: readonly CountryCode[] = [
  "FI", "CH", "CZ", "BY", "AT", "US", "LV", "PL", "JP", "BE", "IS", "ENG", "DE", "EE", "NO", "AU",
  "IE", "UA", "HU", "SE", "IT", "DK", "SK", "CA", "LT", "KZ", "CN", "FR", "NL", "RU", "KR", "SI",
  "PL", "PL", "PL", "PL", "PL",
];

export function originalHillChoices(hills: readonly OriginalHill[]): HillChoice[] {
  return hills.map((h) => ({
    id: `original-${h.number}`,
    name: h.name ?? `Skocznia ${h.number}`,
    kPointM: h.kPointM,
    profile: h.profile,
    source: "original",
    country: ORIGINAL_HILL_COUNTRY[h.number - 1] ?? null,
  }));
}
