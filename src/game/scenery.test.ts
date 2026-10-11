import { describe, expect, it } from "vitest";
import { DUSK_CHANCE, FOG_CHANCE, NIGHT_CHANCE, SNOWFALL_CHANCE, pickScenery } from "./scenery";

describe("scenery", () => {
  it("follows a fixed choice of the time of day", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(pickScenery("day", seed).lighting).toBe("day");
      expect(pickScenery("dusk", seed).lighting).toBe("dusk");
      expect(pickScenery("night", seed).lighting).toBe("night");
    }
  });

  it("varies the time of day and the weather at about the intended rates, the same for the same seed", () => {
    const counts = { night: 0, dusk: 0, snowfall: 0, fog: 0 };
    const visits = 4000;
    for (let i = 0; i < visits; i++) {
      const seed = Math.imul(i, 2654435761) >>> 0;
      const look = pickScenery("varied", seed);
      if (look.lighting === "night") counts.night++;
      if (look.lighting === "dusk") counts.dusk++;
      if (look.snowfall) counts.snowfall++;
      if (look.fog) counts.fog++;
      expect(pickScenery("varied", seed)).toEqual(look);
    }
    expect(counts.night / visits).toBeCloseTo(NIGHT_CHANCE, 1);
    expect(counts.dusk / visits).toBeCloseTo(DUSK_CHANCE, 1);
    expect(counts.snowfall / visits).toBeCloseTo(SNOWFALL_CHANCE, 1);
    expect(counts.fog / visits).toBeCloseTo(FOG_CHANCE, 1);
  });
});
