import type { HillSpec } from "../hill-spec";
import { HILL_SPEC_LIMITS as L } from "../hill-spec-limits";
import { OWN_HILL_SPECS } from "../own-hills";

const [first] = OWN_HILL_SPECS;
if (first === undefined) throw new Error("no own hill");
export const training: HillSpec = first;

type Inrun = HillSpec["profile"]["inrun"];
type Landing = HillSpec["profile"]["landing"];

/** The training hill with some numbers changed. */
export const variant = (change: {
  kPointM?: number;
  inrun?: Partial<Inrun>;
  landing?: Partial<Landing>;
}): HillSpec => ({
  ...training,
  kPointM: change.kPointM ?? training.kPointM,
  profile: {
    inrun: { ...training.profile.inrun, ...change.inrun },
    landing: { ...training.profile.landing, ...change.landing },
  },
});

/** Hills at the edges of the format limits: every measure must stay finite on them. */
export const EXTREME_HILLS: readonly [string, HillSpec][] = [
  [
    "smallest",
    variant({
      kPointM: L.kPointM.min,
      inrun: { startXM: 0, flatEndXM: 0, lineEndXM: 0, takeoffXM: L.inrun.takeoffXM.min, curveA: 0.001 },
      landing: {
        centerXM: L.landing.centerXM.min,
        centerYM: L.landing.centerYM.min,
        amplitudeM: L.landing.amplitudeM.min,
        widthM: L.landing.widthM.min,
        outrunStartXM: L.inrun.takeoffXM.min + L.landing.outrunStartOverTakeoffMinM,
        outrunCurveA: L.landing.outrunCurveA.min,
        knollBlend: 0,
      },
    }),
  ],
  [
    "largest",
    variant({
      kPointM: L.kPointM.max,
      inrun: {
        startXM: 60,
        flatEndXM: 60,
        lineEndXM: 150,
        takeoffXM: 200,
        lineSlope: -3,
        lineInterceptM: 1000,
        curveA: 0.1,
      },
      landing: {
        centerXM: L.landing.centerXM.max,
        centerYM: L.landing.centerYM.max,
        amplitudeM: L.landing.amplitudeM.max,
        widthM: L.landing.widthM.max,
        outrunStartXM: L.landing.outrunStartXM.max,
        outrunCurveA: L.landing.outrunCurveA.max,
        knollBlend: 1,
      },
    }),
  ],
  ["gentlest", variant({ inrun: { lineSlope: -0.1 }, landing: { amplitudeM: 5, widthM: 300 } })],
];
