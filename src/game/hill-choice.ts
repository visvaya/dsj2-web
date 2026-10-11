import type { HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import type { OriginalHill } from "../original/original-hills";

/** A hill the player can pick, from this project or from the player's original files. */
export interface HillChoice {
  id: string;
  name: string;
  kPointM: number;
  profile: HillProfile;
  source: "own" | "original";
}

/** Hills made for this project (not taken from the original game). */
export const OWN_HILLS: readonly HillChoice[] = [
  {
    id: "own-1",
    name: "Ćwiczebna",
    kPointM: 90,
    source: "own",
    profile: buildHillProfile(
      { startXM: 11.4, flatEndXM: 10, lineEndXM: 32, takeoffXM: 44, lineSlope: -0.9, lineInterceptM: 230, curveA: 0.0296 },
      { centerXM: 95, centerYM: 166, amplitudeM: 30, widthM: 40, outrunStartXM: 160, outrunCurveA: 0.012, knollBlend: 0 },
    ),
  },
];

export function originalHillChoices(hills: readonly OriginalHill[]): HillChoice[] {
  return hills.map((h) => ({
    id: `original-${h.number}`,
    name: h.name ?? `Skocznia ${h.number}`,
    kPointM: h.kPointM,
    profile: h.profile,
    source: "original",
  }));
}
