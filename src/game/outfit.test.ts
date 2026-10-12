import { describe, expect, it } from "vitest";
import { OUTFIT_SWATCHES } from "../render/palette";
import { OWN_HILLS } from "./hill-choice";
import { DEFAULT_OUTFIT, OUTFIT_COLOR_COUNT, parseOutfit } from "./outfit";
import { previewFlightState } from "./outfit-preview";

describe("outfit", () => {
  it("has as many colours as the original editor", () => {
    expect(OUTFIT_SWATCHES).toHaveLength(OUTFIT_COLOR_COUNT);
  });

  it("keeps valid parts and repairs the rest", () => {
    expect(parseOutfit({ pants: 0, sleeves: 11, gloves: 3, helmet: 2, skis: 5 })).toEqual({
      pants: 0,
      sleeves: 11,
      gloves: 3,
      helmet: 2,
      skis: 5,
    });
    expect(parseOutfit({ pants: -1, sleeves: 12, gloves: 2.5, helmet: "4" })).toEqual(DEFAULT_OUTFIT);
    expect(parseOutfit(null)).toEqual(DEFAULT_OUTFIT);
  });

  it("previews a jumper in flight, the same every time", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const state = previewFlightState(hill);
    expect(state.jumper.airborne).toBe(true);
    expect(previewFlightState(hill)).toEqual(state);
  });
});
