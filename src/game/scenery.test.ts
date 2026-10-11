import { describe, expect, it } from "vitest";
import { NIGHT_CHANCE, SNOWFALL_CHANCE, pickScenery } from "./scenery";

describe("scenery", () => {
  it("follows a fixed choice of day or night", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(pickScenery("day", seed).lighting).toBe("day");
      expect(pickScenery("night", seed).lighting).toBe("night");
    }
  });

  it("varies night and snowfall at about the intended rates, the same for the same seed", () => {
    let nights = 0;
    let snowy = 0;
    const visits = 3000;
    for (let seed = 0; seed < visits; seed++) {
      const look = pickScenery("varied", seed * 2654435761);
      if (look.lighting === "night") nights++;
      if (look.snowfall) snowy++;
      expect(pickScenery("varied", seed * 2654435761)).toEqual(look);
    }
    expect(nights / visits).toBeCloseTo(NIGHT_CHANCE, 1);
    expect(snowy / visits).toBeCloseTo(SNOWFALL_CHANCE, 1);
  });
});
