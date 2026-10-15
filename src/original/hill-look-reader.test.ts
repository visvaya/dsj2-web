import { describe, expect, it } from "vitest";
import { readHillLook } from "./hill-look-reader";
import type { HillDefinition, PushedCall } from "./hill-table";

/** Words of a Single pushed high word first, as Pascal does. */
function single(x: number): number[] {
  const v = new DataView(new ArrayBuffer(4));
  v.setFloat32(0, x, true);
  return [v.getUint16(2, true), v.getUint16(0, true)];
}

const far = (words: number[]): PushedCall => ({ kind: "far", target: 0, words });
const near = (words: number[]): PushedCall => ({ kind: "near", target: 0, words });

/** A branch shaped like Karpacz's in v2.10P (hill 35). */
function karpacz(): HillDefinition {
  const inrun = [...single(5.7), ...single(9), ...single(23), ...single(44), ...single(10), 163];
  inrun.push(...single(-1), ...single(100), ...single(0.01), 12, 11, 228);
  const landing = [...single(100), ...single(80), ...single(40), ...single(50), ...single(200), ...single(0.002)];
  landing.push(70, 3, 85, 3, 192, ...single(0), ...single(0.5));
  const support = (from: number, to: number, c0: number, c1: number) => [...single(from), ...single(to), c0, c1];
  const supports = [
    ...support(5.7, 8.7, 13, 25),
    ...support(10, 10.9, 13, 17),
    ...support(20, 20.9, 13, 17),
    ...support(35, 42, 13, 25),
    ...support(0, 0, 0, 0),
    ...support(0, 0, 0, 0),
  ];
  return {
    number: 35,
    kPointM: 85,
    inrun: {
      flatEndXM: 9,
      lineEndXM: 23,
      takeoffXM: 44,
      startXM: 10,
      lineSlope: -1,
      lineInterceptM: 100,
      curveA: 0.01,
    },
    landing: {
      centerXM: 100,
      centerYM: 80,
      amplitudeM: 40,
      widthM: 50,
      outrunStartXM: 200,
      outrunCurveA: 0.002,
      knollBlend: 0.5,
    },
    calls: [
      far(inrun),
      far(landing),
      far(supports),
      far([23, 57, 58]),
      near([4292, 50]),
      near([]),
      near([70, 30, 50, 200, 6439]),
    ],
    hiddenTrees: [],
  };
}

describe("how a hill of the original looks", () => {
  it("reads its sky, background, trees, supports, inrun and marks from the branch's calls", () => {
    expect(readHillLook(karpacz())).toEqual({
      skyRgb6: [23, 57, 58],
      terrain: { seed: 4292, amplitudeM: 50, baseOverOutrunM: 3 },
      trees: { firstCount: 70, secondCount: 30, fromXM: 50, toXM: 200, seed: 6439, hidden: [] },
      supports: [
        { fromXM: Math.fround(5.7), toXM: Math.fround(8.7), colour: 13, frontColour: 25 },
        { fromXM: 10, toXM: Math.fround(10.9), colour: 13, frontColour: 17 },
        { fromXM: 20, toXM: Math.fround(20.9), colour: 13, frontColour: 17 },
        { fromXM: 35, toXM: 42, colour: 13, frontColour: 25 },
      ],
      inrun: {
        platformStartXM: Math.fround(5.7),
        nearWallUpPx: 12,
        nearWallDownPx: 11,
        wallColour: 228,
        gateColour: 163,
      },
      marks: { firstMarkM: 70, markCount: 3, fenceColour: 192, fenceStartM: 0 },
    });
  });

  it("gives up on a branch without the scenery calls", () => {
    const def = karpacz();
    expect(readHillLook({ ...def, calls: def.calls.slice(0, 3) })).toBeNull();
  });
});
