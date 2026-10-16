import { PHASE } from "../sim/jump-logic";
import type { PlayerView } from "./player-view";

/**
 * How a player plays a jump, from what it sees (`PlayerView`): when it presses for the takeoff, which body angle it
 * holds in flight and when it presses for the landing. A handful of numbers, so it can be trained by a black-box
 * search and read by a person.
 */
export interface PlayerPolicy {
  /** The takeoff press comes when this many seconds are left to the edge. */
  takeoffAimS: number;
  /** The first part of the flight lasts this many frames from the takeoff; it has a lean of its own. */
  earlyFlightFrames: number;
  /** Lean (minus the body angle the steering holds) in the first part of the flight, in radians. */
  earlyLeanRad: number;
  /** Lean in the rest of the flight at the reference speed and height, with no wind shown, in radians. */
  leanRad: number;
  /** Change of that lean per m/s of speed above `POLICY_REFERENCE.speedMPerS`. */
  leanPerSpeedRadPerMPerS: number;
  /** Change of that lean per metre of height above `POLICY_REFERENCE.heightM`. */
  leanPerHeightRadPerM: number;
  /** Change of that lean per m/s of tail wind shown by the indicator (negative for a head wind). */
  leanPerTailWindRadPerMPerS: number;
  /** The landing press comes, while coming down, below this height above the terrain plus the next term, in metres. */
  landingHeightM: number;
  /** Seconds of the closing speed added to the landing height: a faster descent presses earlier. */
  landingPerClosingS: number;
  /** Telemark (right, then left) or two-footed (right only). */
  telemark: boolean;
}

/** The reference point of the lean's terms. */
const POLICY_REFERENCE = { speedMPerS: 25, heightM: 3 } as const;

/** No policy steers outside these leans, whatever its terms add up to. */
export const LEAN_LIMITS_RAD = { min: -0.2, max: 0.9 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The lean a policy holds at this view, in radians (the steering holds a body angle of minus this). */
export function policyLeanRad(policy: PlayerPolicy, view: PlayerView): number {
  const since = view.framesSinceTakeoff ?? 0;
  const lean =
    since < policy.earlyFlightFrames
      ? policy.earlyLeanRad
      : policy.leanRad +
        policy.leanPerSpeedRadPerMPerS * (view.speedMPerS - POLICY_REFERENCE.speedMPerS) +
        policy.leanPerHeightRadPerM * (view.aboveTerrainM - POLICY_REFERENCE.heightM) +
        policy.leanPerTailWindRadPerMPerS * view.shownTailWindMPerS;
  return clamp(lean, LEAN_LIMITS_RAD.min, LEAN_LIMITS_RAD.max);
}

/** The height above the terrain below which a policy presses for the landing at this view, in metres. */
export function policyLandingHeightM(policy: PlayerPolicy, view: PlayerView): number {
  return policy.landingHeightM + policy.landingPerClosingS * Math.max(0, view.closingMPerS);
}

/** Whether a policy presses for the takeoff at this view (once the jumper crouches before the edge). */
export function policyTakesOff(policy: PlayerPolicy, view: PlayerView, aimShiftS: number): boolean {
  return view.phase === PHASE.crouch && view.speedMPerS > 0 && view.timeToEdgeS <= policy.takeoffAimS + aimShiftS;
}

/**
 * The trained player: `node scripts/train-player.mjs 200` (about 5 minutes on a slow laptop) printed these numbers.
 * Trained on the game's own hills and variants made from their data only (`src/hills/test-support/player-training.ts`:
 * every length scaled from 0.7 to 2.5 times, inruns lengthened and shortened, a variant kept when the geometry rules
 * admit it and it jumps to its size; 19 hills from K63 to K225), on two jump seeds of each wind class, maximising the
 * mean points of the player without noise. The early part of the flight trained away (0 frames). To train again,
 * run the script and copy its numbers and scores here.
 */
export const TRAINED_PLAYER_POLICY: PlayerPolicy = {
  takeoffAimS: 0.2,
  earlyFlightFrames: 0,
  earlyLeanRad: 0.36,
  leanRad: 0.2,
  leanPerSpeedRadPerMPerS: 0,
  leanPerHeightRadPerM: 0.048,
  leanPerTailWindRadPerMPerS: 0,
  landingHeightM: 1.8,
  landingPerClosingS: 0.04,
  telemark: true,
};

/**
 * Scores of `TRAINED_PLAYER_POLICY` printed by the training: the mean points over the training set (the scripted
 * bot before it, `REFERENCE_PLAYER_POLICY`, scored 127.6) and over the game's own hills alone, on the training seeds.
 */
export const TRAINED_POLICY_SCORES = { trainingSet: 154.98026521582352, ownHills: 123.25 } as const;
