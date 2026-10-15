/**
 * Leaning by tilting the phone, the way the Android version of the game does it: the phone turning is the mouse
 * moving. Each frame the change of the tilt angle since the previous frame becomes mouse motion, so the jumper
 * leans by as much as the phone has turned and stays there while the phone is held still. There is no neutral
 * angle and no dead zone; the lean starts from wherever the phone is when the flight begins, because the
 * simulation reads the motion only in flight.
 */

/**
 * Mouse steps per degree of tilt: 2 * 1.1^5, the Android version's formula at its default sensitivity (5 on its
 * scale of 1 to 10). The whole range of the lean is then under nine degrees of tilt.
 */
const TILT_MOTION_PER_DEG = 2 * 1.1 ** 5;
const DEG = Math.PI / 180;

/**
 * Tilt towards and away from the player, in degrees, for the current screen orientation. It is the angle of
 * "up" around the axis that lies across the screen, read from the direction of gravity, so it runs through
 * the whole circle without a break; the browser's own gamma folds at 90 degrees, when a phone held sideways
 * passes upright.
 */
export function pitchDeg(beta: number | null, gamma: number | null, screenAngle: number): number | null {
  if (beta === null || gamma === null) return null;
  // "Up" in the device's own axes: x to the right of the upright phone, y to its top, z out of the screen.
  const upX = -Math.cos(beta * DEG) * Math.sin(gamma * DEG);
  const upY = Math.sin(beta * DEG);
  const upZ = Math.cos(beta * DEG) * Math.cos(gamma * DEG);
  const upright = Math.atan2(upY, upZ) / DEG;
  const sideways = Math.atan2(upX, upZ) / DEG;
  switch (((screenAngle % 360) + 360) % 360) {
    case 90:
      return sideways;
    case 270:
      return -sideways;
    case 180:
      return -upright;
    default:
      return upright;
  }
}

/** Where the phone was a frame ago, and the part of a mouse step not yet handed to the game. */
export interface TiltState {
  readonly previousDeg: number | null;
  readonly carry: number;
}

export const TILT_AT_REST: TiltState = { previousDeg: null, carry: 0 };

/** The change of an angle the short way round, in degrees. */
function turnDeg(from: number, to: number): number {
  const turn = (to - from) % 360;
  if (turn > 180) return turn - 360;
  return turn < -180 ? turn + 360 : turn;
}

/**
 * Mouse motion (the mouse's dy) for the tilt angle of this frame, and the state for the next one. Whole steps
 * go to the game; the fraction is carried over, so a slow tilt is not lost. `gain` is the player's sensitivity
 * (see ./sensitivity.ts).
 */
export function tiltStep(state: TiltState, angleDeg: number, gain = 1): { state: TiltState; motion: number } {
  if (state.previousDeg === null) return { state: { previousDeg: angleDeg, carry: state.carry }, motion: 0 };
  const pending = state.carry + turnDeg(state.previousDeg, angleDeg) * TILT_MOTION_PER_DEG * gain;
  const motion = Math.trunc(pending);
  return { state: { previousDeg: angleDeg, carry: pending - motion }, motion };
}

/** Whether the browser knows the motion sensor at all; without it only the finger leans the jumper. */
export function tiltSupported(ctor: unknown = globalThis.DeviceOrientationEvent): boolean {
  return typeof ctor === "function";
}

/** Whether the browser asks the player before it gives the motion sensor (iOS), which takes a tap. */
export function tiltAsksFirst(ctor: unknown = globalThis.DeviceOrientationEvent): boolean {
  return typeof ctor === "function" && typeof Reflect.get(ctor, "requestPermission") === "function";
}

/** iOS asks for permission (from a tap, over HTTPS); other browsers allow it directly. */
export async function requestTiltPermission(ctor: unknown = globalThis.DeviceOrientationEvent): Promise<boolean> {
  if (typeof ctor !== "function") return false;
  const request: unknown = Reflect.get(ctor, "requestPermission");
  if (typeof request !== "function") return true;
  try {
    const answer: unknown = await Reflect.apply(request, ctor, []);
    return answer === "granted";
  } catch {
    return false;
  }
}
