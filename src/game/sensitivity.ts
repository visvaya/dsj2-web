/**
 * How strongly the player's motion leans the jumper, set per way of steering on a scale of 1 to 10. The scale is
 * the Android version's: each level multiplies the motion by 1.1, and the default level leaves it as it is.
 */
export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 10;
export const SENSITIVITY_DEFAULT = 5;
const GAIN_PER_LEVEL = 1.1;

/** One level for the mouse, one for a finger dragged on the left zone, one for tilting the phone. */
export interface Sensitivity {
  readonly mouse: number;
  readonly drag: number;
  readonly tilt: number;
}

export const DEFAULT_SENSITIVITY: Sensitivity = {
  mouse: SENSITIVITY_DEFAULT,
  drag: SENSITIVITY_DEFAULT,
  tilt: SENSITIVITY_DEFAULT,
};

/** The level names by the way of playing shown on the screen (the touch zones lean by dragging). */
const LEVEL_OF = { mouse: "mouse", touch: "drag", tilt: "tilt" } as const;
type Controls = keyof typeof LEVEL_OF;

export function sensitivityFor(levels: Sensitivity, controls: Controls): number {
  return levels[LEVEL_OF[controls]];
}

export function withSensitivity(levels: Sensitivity, controls: Controls, level: number): Sensitivity {
  return { ...levels, [LEVEL_OF[controls]]: level };
}

/**
 * The mouse at the default level leans by three quarters of its motion: counted one to one, as the original
 * counts a DOS mouse, a modern mouse was found a little too quick.
 */
const MOUSE_MOTION_SCALE = 0.75;

/** The factor a level applies to the motion of the mouse. */
export function mouseGain(level: number): number {
  return MOUSE_MOTION_SCALE * sensitivityGain(level);
}

/** The factor a level applies to the motion. */
export function sensitivityGain(level: number): number {
  return GAIN_PER_LEVEL ** (level - SENSITIVITY_DEFAULT);
}

export function stepSensitivity(level: number, by: -1 | 1): number {
  return Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, level + by));
}

function parseLevel(value: unknown): number {
  const valid =
    typeof value === "number" && Number.isInteger(value) && value >= SENSITIVITY_MIN && value <= SENSITIVITY_MAX;
  return valid ? value : SENSITIVITY_DEFAULT;
}

/** Stored levels; anything missing or outside the scale is the default. */
export function parseSensitivity(stored: unknown): Sensitivity {
  const read = (key: string): unknown =>
    typeof stored === "object" && stored !== null ? Reflect.get(stored, key) : undefined;
  return { mouse: parseLevel(read("mouse")), drag: parseLevel(read("drag")), tilt: parseLevel(read("tilt")) };
}
