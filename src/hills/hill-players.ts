import type { HillChoice } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { BorlandRandom } from "../sim/borland-random";
import { landingSlope, terrainYM } from "../sim/hill-profile";
import { PHASE, type FrameInput } from "../sim/jump-logic";

/**
 * Bots that play a hill like a player does, for the simulation checks of a hill. Everything here is pure and
 * seeded, with no Node or browser imports, so the same checks can later run in a browser worker.
 */

const FRAME_S = 1 / 70;
const M_PER_S_TO_KM_PER_H = 3.6;

/** How a bot presses, frame by frame. */
const BOT_TIMING = {
  /** The frame of the left press that leaves the gate. */
  startFrame: 70,
  /** From this frame on the bot holds left on the inrun, which puts the jumper into the crouch. */
  crouchFromFrame: 140,
  /** A jump that has not ended after this many frames counts as stuck. */
  maxJumpFrames: 6000,
  /** Mouse motion is clamped to this many mickeys per frame, either way. */
  maxSteerMickeys: 40,
  /** Body angle (rad) the steering holds: it steers towards minus this value. */
  steerTargetRad: 0.3,
  /** Mickeys per radian of body angle error. */
  steerMickeysPerRad: 60,
  /** Landing: right for this many frames, then left from 8 to 12 frames after the first press (telemark). */
  landingRightFrames: 4,
  landingLeftFromFrame: 8,
  landingLeftToFrame: 12,
} as const;

/** Random inputs: each button is pressed with this chance per frame; the mouse moves uniformly within the clamp. */
const RANDOM_PRESS_CHANCE = 0.08;

export interface PlayerLevel {
  /** Standard deviation of the takeoff press around the aim, in seconds. */
  timingSpreadS: number;
  /** Share of the steering a player gets right (1 = the full correction). */
  steerGain: number;
  /** Standard deviation of the mouse motion added each frame, in mickeys. */
  steerNoiseMickeys: number;
  /** Height above the terrain at which the landing press comes, and its standard deviation, in metres. */
  landingHeightM: number;
  landingHeightSpreadM: number;
}

/** Three players: weak, average and good. A good one presses on time, steers well and lands on time. */
export const PLAYER_LEVELS = {
  weak: {
    timingSpreadS: 0.08,
    steerGain: 0.6,
    steerNoiseMickeys: 8,
    landingHeightM: 1.5,
    landingHeightSpreadM: 1,
  },
  average: {
    timingSpreadS: 0.04,
    steerGain: 1,
    steerNoiseMickeys: 4,
    landingHeightM: 2,
    landingHeightSpreadM: 0.5,
  },
  good: {
    timingSpreadS: 0.015,
    steerGain: 1,
    steerNoiseMickeys: 2,
    landingHeightM: 2.2,
    landingHeightSpreadM: 0.2,
  },
} as const satisfies Record<string, PlayerLevel>;

/** A good player that never misses the aim: the reference for the takeoff window and the best distance. */
export const EXACT_PLAYER_LEVEL: PlayerLevel = {
  ...PLAYER_LEVELS.good,
  timingSpreadS: 0,
  steerNoiseMickeys: 0,
  landingHeightSpreadM: 0,
};

/** Where the bot aims the takeoff press when no aim is given: frames of time left to the edge. */
const DEFAULT_TAKEOFF_AIM_FRAMES = 14;

/** What one jump came to. */
export interface JumpOutcome {
  distanceM: number;
  fell: boolean;
  disqualified: boolean;
  /** Speed at the first airborne frame; 0 when the jumper never left the ground. */
  takeoffSpeedKmPerH: number;
  flightTimeS: number;
  /** Highest point above the terrain during the flight, in metres. */
  highestAboveTerrainM: number;
  /** Velocity along the slope normal (into the slope) at the first contact after the flight, in m/s. */
  landingImpactMPerS: number;
  frames: number;
  finalXM: number;
  /** Whether the jump ended before the frame cap. */
  ended: boolean;
  /** Whether every sampled number stayed finite. */
  finite: boolean;
  /** How deep the jumper's point went below the terrain at worst, in metres (0 when never below). */
  deepestBelowTerrainM: number;
  /** FNV-1a (32-bit) over the final numbers of the jump as single-precision bit patterns. */
  finalHash: number;
}

/** A source of noise for a bot: uniform numbers in [0, 1) from a seeded generator. */
interface Noise {
  uniform: () => number;
  /** Approximately normal with mean 0 and deviation 1 (sum of twelve uniforms, arithmetic only). */
  normal: () => number;
}

/** `BorlandRandom.below` takes a 16-bit range, so 0x10000 would read as 0. */
const NOISE_RESOLUTION = 0x8000;
const NORMAL_TERMS = 12;

/**
 * Noise from the generator the game itself uses (`BorlandRandom`): a separate instance per jump, owned here, so
 * the bot's draws never touch the jump's own randomness. The normal draw uses only additions, which give the
 * same bits in every engine, unlike `Math.log` or `Math.cos`.
 */
function noiseFrom(seed: number): Noise {
  const rng = new BorlandRandom(seed);
  const uniform = (): number => rng.below(NOISE_RESOLUTION) / NOISE_RESOLUTION;
  const normal = (): number => {
    let sum = 0;
    for (let i = 0; i < NORMAL_TERMS; i++) sum += uniform();
    return sum - NORMAL_TERMS / 2;
  };
  return { uniform, normal };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const inFlight = (phase: number): boolean => phase === PHASE.flightHold || phase === PHASE.flight;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function finalNumbers(jump: TrainingJump): number[] {
  const { logic, jumper } = jump.state;
  return [
    logic.frame,
    logic.phase,
    logic.distanceM,
    logic.fallType,
    logic.flightTimeS,
    logic.takeoffTimingS,
    logic.points,
    logic.bodyAngleRad,
    jumper.xM,
    jumper.yM,
    jumper.vxMPerS,
    jumper.vyMPerS,
    jumper.speedMPerS,
    jump.state.randomSeed,
  ];
}

function hashOf(numbers: readonly number[]): number {
  const view = new DataView(new ArrayBuffer(4));
  return numbers.reduce((h, n) => {
    view.setFloat32(0, n, true);
    return Math.imul(h ^ view.getUint32(0, true), FNV_PRIME) >>> 0;
  }, FNV_OFFSET);
}

/** What a bot sees of the jump at each frame and decides from. */
type Decide = (jump: TrainingJump, frame: number) => FrameInput;

interface Track {
  takeoffSpeedKmPerH: number;
  highestAboveTerrainM: number;
  landingImpactMPerS: number | null;
  wasAirborne: boolean;
  finite: boolean;
  deepestBelowTerrainM: number;
}

function observe(track: Track, jump: TrainingJump): Track {
  const { jumper, logic } = jump.state;
  const hill = jump.hill.profile;
  const aboveM = jumper.yM - terrainYM(hill, jumper.xM);
  const finite = [jumper.xM, jumper.yM, jumper.vxMPerS, jumper.vyMPerS, jumper.speedMPerS, logic.distanceM].every(
    Number.isFinite,
  );
  const firstAir = jumper.airborne && !track.wasAirborne && track.takeoffSpeedKmPerH === 0;
  const firstContact = !jumper.airborne && track.wasAirborne && track.landingImpactMPerS === null;
  const slope = landingSlope(hill, jumper.xM);
  return {
    takeoffSpeedKmPerH: firstAir ? jumper.speedMPerS * M_PER_S_TO_KM_PER_H : track.takeoffSpeedKmPerH,
    highestAboveTerrainM:
      jumper.airborne && inFlight(logic.phase)
        ? Math.max(track.highestAboveTerrainM, aboveM)
        : track.highestAboveTerrainM,
    // With y up and the slope s = dy/dx, the speed into the slope is (vx s + vy) / sqrt(1 + s^2), vy positive down.
    landingImpactMPerS: firstContact
      ? (jumper.vxMPerS * slope + jumper.vyMPerS) / Math.sqrt(1 + slope * slope)
      : track.landingImpactMPerS,
    wasAirborne: track.wasAirborne || jumper.airborne,
    finite: track.finite && finite,
    deepestBelowTerrainM: Math.max(track.deepestBelowTerrainM, -aboveM),
  };
}

function run(hill: HillChoice, seed: number, decide: Decide): JumpOutcome {
  let jump = startTrainingJump(hill, seed);
  let track: Track = {
    takeoffSpeedKmPerH: 0,
    highestAboveTerrainM: 0,
    landingImpactMPerS: null,
    wasAirborne: false,
    finite: true,
    deepestBelowTerrainM: 0,
  };
  let steps = 0;
  while (!isJumpOver(jump) && steps < BOT_TIMING.maxJumpFrames) {
    const frame = jump.state.logic.frame + 1;
    jump = stepTrainingJump(jump, decide(jump, frame));
    track = observe(track, jump);
    steps++;
  }
  const { logic, jumper } = jump.state;
  const disqualified = logic.distanceM === 0;
  return {
    distanceM: logic.distanceM,
    fell: logic.fallType !== 0 && !disqualified,
    disqualified,
    takeoffSpeedKmPerH: track.takeoffSpeedKmPerH,
    flightTimeS: logic.flightTimeS,
    highestAboveTerrainM: track.highestAboveTerrainM,
    landingImpactMPerS: track.landingImpactMPerS ?? 0,
    frames: logic.frame,
    finalXM: jumper.xM,
    ended: isJumpOver(jump),
    finite: track.finite,
    deepestBelowTerrainM: track.deepestBelowTerrainM,
    finalHash: hashOf(finalNumbers(jump)),
  };
}

/** The bot of one player level; its noise and its per-jump draws (aim, landing height) come from `noiseSeed`. */
function playerBot(player: PlayerLevel, noiseSeed: number, aimFrames: number): Decide {
  const noise = noiseFrom(noiseSeed);
  const aimS = aimFrames * FRAME_S + noise.normal() * player.timingSpreadS;
  const landingHeightM = player.landingHeightM + noise.normal() * player.landingHeightSpreadM;
  let pressedTakeoff = false;
  let landingFrame: number | null = null;
  let previousAboveM = 0;
  return (jump, frame) => {
    const { jumper, logic } = jump.state;
    const hill = jump.hill.profile;
    const { phase } = logic;
    if (phase === PHASE.crouch && !pressedTakeoff && jumper.speedMPerS > 0) {
      pressedTakeoff = (hill.takeoffXM - jumper.xM) / jumper.speedMPerS <= aimS;
    }
    const takingOff = pressedTakeoff && (phase === PHASE.crouch || phase === PHASE.takeoff) && !jumper.airborne;
    // Only a sinking jumper lands: just past the edge the jumper is as low as the table is high, but rising.
    const aboveM = jumper.yM - terrainYM(hill, jumper.xM);
    const sinking = aboveM < previousAboveM;
    previousAboveM = aboveM;
    if (landingFrame === null && inFlight(phase) && sinking && aboveM < landingHeightM) {
      landingFrame = frame;
    }
    const sinceLanding = landingFrame === null ? -1 : frame - landingFrame;
    const t = BOT_TIMING;
    const landingRight = sinceLanding >= 0 && sinceLanding < t.landingRightFrames;
    const landingLeft = sinceLanding >= t.landingLeftFromFrame && sinceLanding <= t.landingLeftToFrame;
    const steer = (logic.bodyAngleRad + t.steerTargetRad) * t.steerMickeysPerRad * player.steerGain;
    const dy = inFlight(phase) && landingFrame === null ? steer + noise.normal() * player.steerNoiseMickeys : 0;
    return {
      left: frame === t.startFrame || (phase === PHASE.inrun && frame >= t.crouchFromFrame) || takingOff || landingLeft,
      right: takingOff || landingRight,
      dy: clamp(Math.round(dy), -t.maxSteerMickeys, t.maxSteerMickeys),
    };
  };
}

/** One jump of a player on a hill: `seed` sets the jump (wind), `noiseSeed` the player's own errors. */
export function playJump(
  hill: HillChoice,
  seed: number,
  player: PlayerLevel,
  noiseSeed: number,
  aimFrames: number = DEFAULT_TAKEOFF_AIM_FRAMES,
): JumpOutcome {
  return run(hill, seed, playerBot(player, noiseSeed, aimFrames));
}

/** One jump with random inputs: both buttons pressed now and then, the mouse anywhere within its clamp. */
export function randomJump(hill: HillChoice, seed: number, noiseSeed: number): JumpOutcome {
  const noise = noiseFrom(noiseSeed);
  const max = BOT_TIMING.maxSteerMickeys;
  return run(hill, seed, () => ({
    left: noise.uniform() < RANDOM_PRESS_CHANCE,
    right: noise.uniform() < RANDOM_PRESS_CHANCE,
    dy: Math.floor(noise.uniform() * (2 * max + 1)) - max,
  }));
}

/** The takeoff aims a sweep tries, in frames of time left to the edge (negative is past it). */
const AIM_SWEEP_FRAMES = { from: -10, to: 30 } as const;

export interface AimSweep {
  bestDistanceM: number;
  bestAimFrames: number;
  /** Aim frames within the tolerance of the best distance, without a fall or a disqualification. */
  windowFrames: number;
}

/** Sweeps the takeoff aim frame by frame for a good player who never misses it, once per jump seed. */
export function bestTakeoffAim(hill: HillChoice, seeds: readonly number[], toleranceM: number): AimSweep[] {
  const aims = Array.from(
    { length: AIM_SWEEP_FRAMES.to - AIM_SWEEP_FRAMES.from + 1 },
    (_, i) => AIM_SWEEP_FRAMES.from + i,
  );
  return seeds.map((seed) => {
    const clean = aims
      .map((aim) => ({ aim, o: playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, aim) }))
      .filter(({ o }) => !o.fell && !o.disqualified);
    const best = clean.reduce<{ aim: number; distanceM: number } | null>(
      (b, { aim, o }) => (b === null || o.distanceM > b.distanceM ? { aim, distanceM: o.distanceM } : b),
      null,
    );
    if (best === null) return { bestDistanceM: 0, bestAimFrames: AIM_SWEEP_FRAMES.from, windowFrames: 0 };
    return {
      bestDistanceM: best.distanceM,
      bestAimFrames: best.aim,
      windowFrames: clean.filter(({ o }) => o.distanceM >= best.distanceM - toleranceM).length,
    };
  });
}
