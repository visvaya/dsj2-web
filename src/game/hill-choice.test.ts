import { describe, expect, it } from "vitest";
import { DEFAULT_HILL_LOOK } from "../render/hill-look";
import { OWN_HILLS, RETIRED_OWN_HILL_IDS } from "./hill-choice";

describe("own hills", () => {
  it("builds the training hill with the profile it always had", () => {
    expect(OWN_HILLS[0]).toEqual({
      id: "own-3",
      name: "Ćwiczebna",
      kPointM: 90,
      source: "own",
      country: null,
      look: DEFAULT_HILL_LOOK,
      profile: {
        startXM: 10.600000381469727,
        inrunFlatEndXM: 9.199999809265137,
        inrunLineEndXM: 25.299999237060547,
        takeoffXM: 46,
        inrunLineSlope: -1,
        inrunLineInterceptM: 230,
        inrunCurveA: 0.019999999552965164,
        inrunCurveB: -2.0119998455047607,
        inrunCurveCM: 242.8018035888672,
        inrunFrictionCoef: 0.019999999552965164,
        landingCenterXM: 115,
        landingCenterYM: 150.89999389648438,
        landingAmplitudeM: 45,
        landingInvWidthPerM: 0.019999999552965164,
        outrunStartXM: 170,
        outrunCurveA: 0.009999999776482582,
        outrunCurveB: -3.723281145095825,
        outrunCurveCM: 458.8353271484375,
        landingFrictionCoef: 0.05000000074505806,
        knollBlend: 0.30000001192092896,
      },
    });
  });

  it("gives own hills unique ids that were never retired", () => {
    const ids = OWN_HILLS.map((hill) => hill.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => RETIRED_OWN_HILL_IDS.has(id))).toEqual([]);
  });
});
