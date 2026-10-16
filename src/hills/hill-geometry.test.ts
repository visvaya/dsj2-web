import { describe, expect, it } from "vitest";
import { LAYER_TABLE_LENGTH_M } from "../render/hill-layer-tables";
import { buildHillProfile } from "../sim/hill-setup";
import { geometryProblems, geometryRuleProblems, HILL_RULES, hillGeometry, type HillGeometry } from "./hill-geometry";
import type { HillSpec } from "./hill-spec";
import { HILL_SPEC_LIMITS } from "./hill-spec-limits";
import { OWN_HILL_SPECS } from "./own-hills";

const [training] = OWN_HILL_SPECS;
if (training === undefined) throw new Error("no own hill");

type Inrun = HillSpec["profile"]["inrun"];
type Landing = HillSpec["profile"]["landing"];

/** The training hill with some numbers changed. */
const variant = (change: { kPointM?: number; inrun?: Partial<Inrun>; landing?: Partial<Landing> }): HillSpec => ({
  ...training,
  kPointM: change.kPointM ?? training.kPointM,
  profile: {
    inrun: { ...training.profile.inrun, ...change.inrun },
    landing: { ...training.profile.landing, ...change.landing },
  },
});

const rulesOf = (spec: HillSpec) => geometryProblems(spec).map((p) => p.rule);

const trainingGeometry = (): HillGeometry => {
  const { inrun, landing } = training.profile;
  return hillGeometry(buildHillProfile(inrun, landing), training.kPointM);
};

describe("hill geometry", () => {
  it("measures the training hill", () => {
    const g = trainingGeometry();
    expect(g.takeoffAngleDeg).toBeCloseTo(9.76, 2);
    expect(g.tableHeightM).toBeCloseTo(2.03, 2);
    expect(g.inrunDropM).toBeCloseTo(26.83, 2);
    expect(g.steepestInrunDeg).toBeCloseTo(45, 3);
    expect(g.kXM).toBeCloseTo(121.87, 1);
    expect(g.landingAngleAtKDeg).toBeCloseTo(41.45, 1);
    expect(g.steepestLandingXM).toBeCloseTo(115, 5);
    expect(g.landingAreaEndXM).toBeCloseTo(146.2, 5);
    expect(g.landingAreaEndM).toBeCloseTo(120.77, 1);
    expect(g.outrunLowestXM).toBeCloseTo(186.16, 1);
    expect(g.inrunDescends).toBe(true);
    expect(g.landingDescends).toBe(true);
    // The flat part behind the gate meets the straight part at its full angle; the other joins are smooth.
    expect(g.joins.flatToLine.slopeDeg).toBeCloseTo(45, 3);
    expect(g.joins.lineToCurve.heightM).toBeLessThan(1e-3);
    expect(g.joins.landingToOutrun.slopeDeg).toBeLessThan(1e-3);
  });

  it("keeps the scenery's length as the limit of the outrun", () => {
    expect(HILL_RULES.outrunLowestMaxXM).toBe(LAYER_TABLE_LENGTH_M);
  });

  it.each([
    ["geometry.takeoff-angle", variant({ inrun: { lineEndXM: 26.8, lineInterceptM: 231.2 } })],
    ["geometry.table-height", variant({ inrun: { lineInterceptM: 232 } })],
    ["geometry.landing-angle-at-k", variant({ kPointM: 115, landing: { amplitudeM: 65, centerYM: 133.3 } })],
    ["geometry.k-near-steepest", variant({ kPointM: 103 })],
    ["geometry.landing-area-length", variant({ kPointM: 80 })],
    ["geometry.outrun-length", variant({ landing: { outrunCurveA: 0.03 } })],
    ["geometry.outrun-within-scene", variant({ landing: { outrunCurveA: 0.0007 } })],
  ])("reports %s alone for a hill that breaks only that rule", (rule, spec) => {
    expect(rulesOf(spec)).toEqual([rule]);
  });

  // The profile is built with smooth joins, an inrun that rises also takes off upwards, and the outrun cannot rise
  // before its lowest point: these rules are shown on measures changed by hand.
  it.each([
    ["geometry.join-height", { joins: { ...trainingGeometry().joins, flatToLine: { heightM: 0.02, slopeDeg: 45 } } }],
    ["geometry.join-slope", { joins: { ...trainingGeometry().joins, lineToCurve: { heightM: 0, slopeDeg: 0.6 } } }],
    ["geometry.inrun-descends", { inrunDescends: false }],
    ["geometry.landing-descends", { landingDescends: false }],
  ] as const)("reports %s alone for measures that break only that rule", (rule, change) => {
    const g: HillGeometry = { ...trainingGeometry(), ...change };
    expect(geometryRuleProblems(g, training.kPointM).map((p) => p.rule)).toEqual([rule]);
  });

  const L = HILL_SPEC_LIMITS;
  const extremes: readonly [string, HillSpec][] = [
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

  it.each(extremes)("gives finite measures for the %s hill the format allows", (_name, spec) => {
    const { inrun, landing } = spec.profile;
    const g = hillGeometry(buildHillProfile(inrun, landing), spec.kPointM);
    expect(
      Object.values(g)
        .flatMap((v) => (typeof v === "number" ? [v] : []))
        .every(Number.isFinite),
    ).toBe(true);
    expect(
      Object.values(g.joins)
        .flatMap((j) => [j.heightM, j.slopeDeg])
        .every(Number.isFinite),
    ).toBe(true);
    expect(() => geometryProblems(spec)).not.toThrow();
  });
});
