/**
 * Leaning by tilting the phone: the tilt away from the angle held when the flight begins acts like holding the
 * mouse moving, i.e. it sets the lean rate.
 */
const TILT_DEAD_ZONE_DEG = 3;
const TILT_GAIN_PER_DEG = 1.5;
const TILT_MAX_MOTION = 60;

/** Tilt towards and away from the player, in degrees, for the current screen orientation. */
export function pitchDeg(beta: number | null, gamma: number | null, screenAngle: number): number | null {
  if (beta === null || gamma === null) return null;
  switch (((screenAngle % 360) + 360) % 360) {
    case 90:
      return -gamma;
    case 270:
      return gamma;
    case 180:
      return -beta;
    default:
      return beta;
  }
}

/**
 * The pitch that counts as no lean. Until the jumper is in the air it follows the phone, so the angle the
 * phone is held at when the flight begins is the neutral one, however it was held at the gate; from then on
 * it stays, and only tilting away from it leans.
 */
export function neutralPitch(inFlight: boolean, pitch: number, neutral: number | null): number {
  return inFlight && neutral !== null ? neutral : pitch;
}

/** Motion for one frame (the mouse's dy) from the tilt relative to the neutral position. */
export function tiltMotion(pitch: number, neutral: number): number {
  const d = pitch - neutral;
  if (Math.abs(d) <= TILT_DEAD_ZONE_DEG) return 0;
  const v = (d - Math.sign(d) * TILT_DEAD_ZONE_DEG) * TILT_GAIN_PER_DEG;
  return Math.max(-TILT_MAX_MOTION, Math.min(TILT_MAX_MOTION, Math.round(v)));
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
