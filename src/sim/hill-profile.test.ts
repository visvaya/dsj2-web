import { describe, expect, it } from "vitest";
import {
  inrunSlope,
  inrunYM,
  landingArcLengthM,
  landingSlope,
  landingYM,
  terrainSlopeRad,
  type HillProfile,
} from "./hill-profile";
import { f32 } from "./physics-constants";

/** Synthetic hill built the way 1eee:051f and 1eee:06e1 derive the dependent terms. */
function syntheticHill(): HillProfile {
  const slope = -1;
  const intercept = 220;
  const lineEnd = 30;
  const curveA = 0.004;
  const curveB = slope - 2 * curveA * lineEnd;
  const curveC = slope * lineEnd + intercept - curveA * lineEnd * lineEnd - curveB * lineEnd;
  const base: HillProfile = {
    startXM: 11.4,
    inrunFlatEndXM: 12,
    inrunLineEndXM: lineEnd,
    takeoffXM: 44,
    inrunLineSlope: slope,
    inrunLineInterceptM: intercept,
    inrunCurveA: curveA,
    inrunCurveB: curveB,
    inrunCurveCM: curveC,
    inrunFrictionCoef: 0.02,
    landingCenterXM: 110,
    landingCenterYM: 120,
    landingAmplitudeM: 60,
    landingInvWidthPerM: 1 / 40,
    outrunStartXM: 170,
    outrunCurveA: 0,
    outrunCurveB: 0,
    outrunCurveCM: 0,
    landingFrictionCoef: 0.05,
    knollBlend: 0,
  };
  const outrunA = 0.01;
  const slopeAtStart = landingSlope(base, base.outrunStartXM);
  const outrunB = slopeAtStart - 2 * outrunA * base.outrunStartXM;
  const outrunC =
    landingYM(base, base.outrunStartXM) - outrunA * base.outrunStartXM ** 2 - outrunB * base.outrunStartXM;
  return { ...base, outrunCurveA: outrunA, outrunCurveB: outrunB, outrunCurveCM: outrunC };
}

// Heights are Singles (about 1e-5 m resolution near 200 m), so the step must not be tiny.
const numericSlope = (fn: (x: number) => number, x: number, h = 0.05) => (fn(x + h) - fn(x - h)) / (2 * h);

describe("hill profile", () => {
  const hill = syntheticHill();

  it("keeps the inrun continuous with a matching slope at the end of the straight part", () => {
    const x = hill.inrunLineEndXM;
    expect(inrunYM(hill, x + 1e-4)).toBeCloseTo(inrunYM(hill, x), 2);
    expect(inrunSlope(hill, x + 1e-4)).toBeCloseTo(inrunSlope(hill, x), 3);
  });

  it("keeps the inrun flat before the straight part", () => {
    expect(inrunYM(hill, 0)).toBe(inrunYM(hill, hill.inrunFlatEndXM - 1e-3));
    expect(inrunSlope(hill, 0)).toBe(0);
  });

  it("returns analytic slopes that match numeric derivatives of the heights", () => {
    for (const x of [50, 80, 110, 140, 165, 175, 200]) {
      expect(landingSlope(hill, x)).toBeCloseTo(numericSlope((v) => landingYM(hill, v), x), 2);
    }
    for (const x of [20, 35, 40]) {
      expect(inrunSlope(hill, x)).toBeCloseTo(numericSlope((v) => inrunYM(hill, v), x), 2);
    }
  });

  it("turns slopes into angles with the takeoff as the switch point", () => {
    expect(terrainSlopeRad(hill, 20)).toBe(f32(Math.atan(hill.inrunLineSlope)));
    expect(terrainSlopeRad(hill, 100)).toBe(f32(Math.atan(landingSlope(hill, 100))));
  });

  it("measures arc length that is at least the horizontal distance", () => {
    const length = landingArcLengthM(hill, 44, 120, 0.5);
    expect(length).toBeGreaterThan(76);
    const straight = Math.hypot(120 - 44, landingYM(hill, 120) - landingYM(hill, 44));
    expect(length).toBeGreaterThanOrEqual(straight - 1e-3);
  });
});
