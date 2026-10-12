import { describe, expect, it } from "vitest";
import { inrunSlope, inrunYM, landingSlope, landingYM } from "./hill-profile";
import { buildHillProfile, type InrunSpec, type LandingSpec } from "./hill-setup";

const INRUN: InrunSpec = {
  startXM: 11.4,
  flatEndXM: 10,
  lineEndXM: 32,
  takeoffXM: 44,
  lineSlope: -0.9,
  lineInterceptM: 230,
  curveA: 0.0296,
};
const LANDING: LandingSpec = {
  centerXM: 95,
  centerYM: 150,
  amplitudeM: 30,
  widthM: 40,
  outrunStartXM: 160,
  outrunCurveA: 0.012,
  knollBlend: 0.2,
};

describe("hill setup", () => {
  const h = buildHillProfile(INRUN, LANDING);

  it("joins the inrun curve to the straight part with the same height and slope", () => {
    const x = h.inrunLineEndXM;
    expect(inrunYM(h, x + 1e-4)).toBeCloseTo(inrunYM(h, x), 2);
    expect(inrunSlope(h, x + 1e-4)).toBeCloseTo(inrunSlope(h, x), 3);
  });

  it("joins the outrun to the landing hill with the same height and slope", () => {
    const x = h.outrunStartXM;
    expect(landingYM(h, x + 1e-3)).toBeCloseTo(landingYM(h, x), 2);
    expect(landingSlope(h, x + 1e-3)).toBeCloseTo(landingSlope(h, x), 3);
  });

  it("stores every value as a Single and inverts the width", () => {
    const values: unknown[] = Object.values(h);
    for (const value of values) {
      expect(value).toBe(Math.fround(Number(value)));
    }
    expect(h.landingInvWidthPerM).toBe(Math.fround(1 / 40));
    expect(h.knollBlend).toBe(Math.fround(0.2));
  });
});
