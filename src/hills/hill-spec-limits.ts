/** A closed range of numbers; `integer` when only whole numbers fit. */
export interface NumberLimit {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

const range = (min: number, max: number): NumberLimit => ({ min, max });
const integers = (min: number, max: number): NumberLimit => ({ min, max, integer: true });

/**
 * Limits of the hill data format: what the engine and the renderer can take, not what makes a good hill (that is
 * `HILL_RULES`). Round numbers with room on both sides of the hills there are.
 */
export const HILL_SPEC_LIMITS = {
  kPointM: integers(20, 300),
  id: { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, minLength: 1, maxLength: 40 },
  /** Characters after NFC normalisation. */
  name: { minLength: 1, maxLength: 24 },
  inrun: {
    startXM: range(0, 60),
    flatEndXM: range(0, 60),
    lineEndXM: range(0, 150),
    takeoffXM: range(10, 200),
    lineSlope: range(-3, -0.1),
    lineInterceptM: range(0, 1000),
    curveA: range(0.001, 0.1),
  },
  landing: {
    centerXM: range(20, 400),
    centerYM: range(-200, 1000),
    amplitudeM: range(5, 300),
    widthM: range(10, 300),
    /** The lower end is the takeoff plus this many metres. */
    outrunStartOverTakeoffMinM: 20,
    outrunStartXM: range(0, 600),
    outrunCurveA: range(0.0001, 0.05),
    knollBlend: range(0, 1),
  },
  look: {
    skyRgb6: integers(0, 63),
    terrain: { seed: integers(0, 65535), amplitudeM: range(0, 200), baseOverOutrunM: range(-50, 100) },
    trees: {
      count: integers(0, 120),
      xM: range(-300, 600),
      seed: integers(0, 65535),
      hiddenMaxCount: 8,
      hiddenLayer: integers(1, 15),
      hiddenRecord: integers(1, 120),
    },
    supports: { maxCount: 8, xM: range(0, 200), colour: integers(0, 255) },
    inrun: {
      platformStartXM: range(0, 60),
      nearWallPx: integers(0, 60),
      wallColour: integers(0, 255),
      /** The near half of the gate takes the next index, so the last index is not available. */
      gateColour: integers(0, 254),
    },
    marks: {
      firstMarkM: range(0, 300),
      markCount: integers(0, 13),
      fenceColour: integers(0, 255),
      fenceStartM: range(-30, 30),
    },
  },
} as const;
