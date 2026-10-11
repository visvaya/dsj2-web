import type { JumpLogicState } from "../sim/jump-logic";

/**
 * What the sound depends on in one frame. Sound only listens to the game: nothing here feeds back into the
 * simulation, so jumps stay deterministic with or without audio.
 */
export interface MixInput {
  airborne: boolean;
  /** Speed along the track or the snow while on the ground, m/s. */
  groundSpeedMPerS: number;
  /** Speed through the air while flying, m/s. */
  airSpeedMPerS: number;
  /** Displayed wind speed (the indicator box), m/s. */
  windMPerS: number;
  /** The jump screen is paused (menu open, tab hidden): continuous sounds go quiet. */
  paused: boolean;
}

/** One continuous layer: a filtered noise at a gain. */
export interface Layer {
  gain: number;
  /** Centre (band-pass) or cut-off (low-pass) frequency of the layer's filter. */
  freqHz: number;
}

export interface Mix {
  /** Skis on the inrun track or the snow. */
  skis: Layer;
  /** Air rushing past in flight. */
  air: Layer;
  /** Wind in the background, always faintly there. */
  wind: Layer;
}

const SKIS_MAX_GAIN = 0.22;
const SKIS_FULL_SPEED_M_PER_S = 26;
const SKIS_BASE_HZ = 300;
const SKIS_HZ_PER_M_PER_S = 35;
const AIR_MAX_GAIN = 0.2;
const AIR_FULL_SPEED_M_PER_S = 28;
const AIR_BASE_HZ = 600;
const AIR_HZ_PER_M_PER_S = 30;
const WIND_BASE_GAIN = 0.025;
const WIND_EXTRA_GAIN = 0.06;
const WIND_FULL_M_PER_S = 5;
const WIND_BASE_HZ = 220;
const WIND_HZ_PER_M_PER_S = 40;
/** Below this the skis are standing still. */
const MOVING_M_PER_S = 0.3;

const share = (v: number, full: number) => Math.min(1, Math.max(0, v / full));

/** Gains and filter frequencies of the continuous layers for one frame. */
export function soundMix(i: MixInput): Mix {
  const quiet = i.paused ? 0 : 1;
  const sliding = !i.airborne && i.groundSpeedMPerS > MOVING_M_PER_S;
  return {
    skis: {
      gain: sliding ? quiet * SKIS_MAX_GAIN * share(i.groundSpeedMPerS, SKIS_FULL_SPEED_M_PER_S) : 0,
      freqHz: SKIS_BASE_HZ + i.groundSpeedMPerS * SKIS_HZ_PER_M_PER_S,
    },
    air: {
      gain: i.airborne ? quiet * AIR_MAX_GAIN * share(i.airSpeedMPerS, AIR_FULL_SPEED_M_PER_S) : 0,
      freqHz: AIR_BASE_HZ + i.airSpeedMPerS * AIR_HZ_PER_M_PER_S,
    },
    wind: {
      gain: quiet * (WIND_BASE_GAIN + WIND_EXTRA_GAIN * share(i.windMPerS, WIND_FULL_M_PER_S)),
      freqHz: WIND_BASE_HZ + i.windMPerS * WIND_HZ_PER_M_PER_S,
    },
  };
}

/** Judges' notes that appear between two presentation frames (each judge has its own frame, as in the original). */
export function notesAppearing(logic: JumpLogicState, fromFrame: number, toFrame: number): { counted: boolean }[] {
  if (!logic.finished || !(logic.distanceM > 0)) return [];
  return logic.judges.filter((j) => j.showFrame > fromFrame && j.showFrame <= toFrame).map((j) => ({ counted: j.counted }));
}
