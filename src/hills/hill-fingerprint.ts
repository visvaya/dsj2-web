import type { HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import type { HillSpec } from "./hill-spec";

/** The numbers of a built profile in the order they enter the fingerprint; changing it changes every fingerprint. */
const PROFILE_KEYS: readonly (keyof HillProfile)[] = [
  "startXM",
  "inrunFlatEndXM",
  "inrunLineEndXM",
  "takeoffXM",
  "inrunLineSlope",
  "inrunLineInterceptM",
  "inrunCurveA",
  "inrunCurveB",
  "inrunCurveCM",
  "inrunFrictionCoef",
  "landingCenterXM",
  "landingCenterYM",
  "landingAmplitudeM",
  "landingInvWidthPerM",
  "outrunStartXM",
  "outrunCurveA",
  "outrunCurveB",
  "outrunCurveCM",
  "landingFrictionCoef",
  "knollBlend",
];

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const BYTES_PER_NUMBER = 4;

/**
 * What a hill's physics depends on, as eight hex digits: FNV-1a (32-bit) over the K point and the 20 numbers of
 * the built profile, each as the four bytes of its single-precision value, little-endian. The look does not enter
 * it. Records and replays belong to one fingerprint: a hill whose fingerprint changes needs a new id.
 */
export function hillFingerprint(spec: HillSpec): string {
  const profile = buildHillProfile(spec.profile.inrun, spec.profile.landing);
  const numbers = [spec.kPointM, ...PROFILE_KEYS.map((key) => profile[key])];
  const view = new DataView(new ArrayBuffer(numbers.length * BYTES_PER_NUMBER));
  numbers.forEach((n, i) => {
    view.setFloat32(i * BYTES_PER_NUMBER, n, true);
  });
  const bytes = new Uint8Array(view.buffer);
  const hash = bytes.reduce((h, b) => Math.imul(h ^ b, FNV_PRIME) >>> 0, FNV_OFFSET);
  return hash.toString(16).padStart(8, "0");
}
