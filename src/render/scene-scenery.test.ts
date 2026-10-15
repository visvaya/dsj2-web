import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { DEFAULT_HILL_LOOK, type HillLook } from "./hill-look";
import { backgroundWaves } from "./scene-backdrop";
import { LINE_COLOUR, distanceLines } from "./scene-hill";
import { SKY_FIRST_INDEX, greyedMiddle, sceneDac } from "./scene-palette";
import { placeTrees, treeBitmap } from "./scene-trees";

const hill = OWN_HILLS[0];
const rgbAt = (dac: Uint8Array, i: number) => Array.from(dac.subarray(i * 3, i * 3 + 3));

describe("the scene palette", () => {
  it("builds the original's ramps (values of v2.10P's palette during a jump)", () => {
    const dac = sceneDac([23, 57, 58]);
    expect([0, 31, 63, 0x4a, 0x8a, 0xca, 0xea].map((i) => rgbAt(dac, i))).toEqual([
      [0, 0, 2],
      [29, 30, 31],
      [56, 56, 63],
      [58, 12, 12],
      [15, 61, 61],
      [59, 43, 5],
      [31, 31, 31],
    ]);
  });

  it("pulls the middle colours towards grey with the original's rounding of exact halves", () => {
    expect(greyedMiddle([63, 10, 10])).toEqual([58, 12, 12]);
    expect(greyedMiddle([10, 63, 63])).toEqual([15, 61, 61]);
  });

  it("fades the sky from dark blue at the top to the hill's colour at the horizon", () => {
    const dac = sceneDac([23, 57, 58]);
    expect(rgbAt(dac, SKY_FIRST_INDEX)).toEqual([25, 25, 60]);
    expect(rgbAt(dac, 0xfa)).toEqual([32, 46, 58]);
    expect(rgbAt(dac, 0xff)).toEqual([23, 57, 58]);
  });
});

describe("the background hills", () => {
  it("draw their waves from the hill's seed as the original does", () => {
    const sets = backgroundWaves(4292, 50);
    expect(sets).toHaveLength(5);
    expect(sets[0]?.[0]).toEqual({
      amplitude: Math.fround(14.827066421508789),
      phase: Math.fround(1.996000051498413),
      frequency: Math.fround(0.010406414978206158),
    });
    expect(sets[4]?.[3]).toEqual({
      amplitude: Math.fround(14.313616752624512),
      phase: Math.fround(3.009000062942505),
      frequency: Math.fround(0.006863419897854328),
    });
  });
});

describe("the lines on the landing hill", () => {
  it("are the marks every 5 m, the K point in red and the record in blue", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 3, fenceColour: 0xc0, fenceStartM: 0 }, 91.5);
    expect(lines.map((l) => [l.distanceM, l.colour])).toEqual([
      [70.15, LINE_COLOUR.mark],
      [75.15, LINE_COLOUR.mark],
      [80.15, LINE_COLOUR.mark],
      [85.15, LINE_COLOUR.kPoint],
      [91.75, LINE_COLOUR.record],
    ]);
  });

  it("puts the record line out of sight when there is no record", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 0, fenceColour: 0xc0, fenceStartM: 0 }, 0);
    expect(lines.at(-1)?.distanceM).toBeGreaterThan(1000);
  });
});

describe("the trees", () => {
  it("stand on layers 2 to 15, at most 20 on a layer, none near the takeoff on the nearest layers", () => {
    if (!hill) throw new Error("no hill");
    const trees = placeTrees(hill.profile, hill.look);
    expect(trees.length).toBeGreaterThan(20);
    expect(trees.every((t) => t.layer >= 2 && t.layer <= 15)).toBe(true);
    for (let layer = 2; layer <= 15; layer++) {
      expect(trees.filter((t) => t.layer === layer).length).toBeLessThanOrEqual(20);
    }
    const takeoff = hill.profile.takeoffXM;
    const near = trees.filter((t) => t.layer >= 11 && t.xM >= takeoff - 30 && t.xM <= takeoff + 20);
    expect(near).toEqual([]);
  });

  it("leave out the ones a hill takes out of sight", () => {
    if (!hill) throw new Error("no hill");
    const all = placeTrees(hill.profile, hill.look);
    const layer = all[0]?.layer ?? 2;
    const look: HillLook = {
      ...DEFAULT_HILL_LOOK,
      trees: { ...DEFAULT_HILL_LOOK.trees, hidden: [{ layer, first: 1, last: 1 }] },
    };
    const some = placeTrees(hill.profile, look);
    expect(some.length).toBe(all.length - 1);
    expect(some.filter((t) => t.layer === layer)).toEqual(all.filter((t) => t.layer === layer).slice(1));
  });

  it("have the original's sizes, narrower in square pixels", () => {
    const largest = treeBitmap("spruce", 12, 1);
    expect([largest.width, largest.height]).toEqual([71, 120]);
    expect(treeBitmap("pine", 2, 6 / 5).height).toBe(6);
    expect(treeBitmap("pine", 12, 6 / 5).width).toBe(56);
  });
});
