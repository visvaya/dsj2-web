import type { HillSpec } from "./hill-spec";

/**
 * Hills made for this project, as data. A change of a hill's geometry needs a new id, and the old id goes to the
 * retired ones, so records and replays made on the old shape never meet the new one.
 */
export const OWN_HILL_SPECS: readonly HillSpec[] = [
  {
    schemaVersion: 1,
    // "own-1" was the first profile of this hill, outside the original's ranges at its K point.
    id: "own-2",
    name: "Ćwiczebna",
    kPointM: 90,
    profile: {
      inrun: {
        startXM: 11.4,
        flatEndXM: 10,
        lineEndXM: 25.3,
        takeoffXM: 46,
        lineSlope: -1,
        lineInterceptM: 230,
        curveA: 0.02,
      },
      landing: {
        centerXM: 115,
        centerYM: 150.9,
        amplitudeM: 45,
        widthM: 50,
        outrunStartXM: 170,
        outrunCurveA: 0.01,
        knollBlend: 0.3,
      },
    },
    look: {
      skyRgb6: [30, 50, 63],
      terrain: { seed: 4321, amplitudeM: 50, baseOverOutrunM: 3 },
      trees: { firstCount: 70, secondCount: 30, fromXM: 50, toXM: 200, seed: 5150, hidden: [] },
      supports: [
        { fromXM: 7, toXM: 9.5, colour: 13, frontColour: 25 },
        { fromXM: 20, toXM: 21, colour: 13, frontColour: 17 },
        { fromXM: 33, toXM: 40, colour: 13, frontColour: 25 },
      ],
      inrun: { platformStartXM: 6, nearWallUpPx: 12, nearWallDownPx: 11, wallColour: 228, gateColour: 163 },
      marks: { firstMarkM: 75, markCount: 3, fenceColour: 192, fenceStartM: 0 },
    },
  },
];
