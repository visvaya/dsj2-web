import { PHASE, type JumpLogicState } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";

/**
 * What the sound depends on in one frame. Sound only listens to the game: nothing here feeds back into the
 * simulation, so jumps stay deterministic with or without audio.
 */
export interface MixInput {
  airborne: boolean;
  /** On the inrun track (before the takeoff); otherwise the skis are on the snow of the landing hill. */
  onTrack: boolean;
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
  /** Sharpness of the filter: a high value gives a band-pass a pitch, a low one leaves a hiss. */
  q: number;
}

/** Pulsing of the ground layers: the joints of the track passing under the skis. */
interface Flutter {
  rateHz: number;
  /** Share of the loudness that pulses, 0 (steady) to 1. */
  depth: number;
}

export interface Mix {
  /** The low body of the skis' sound, on the track and on the snow. */
  rumble: Layer;
  /** The skis' edge: a rising note on the icy track, a hiss on the snow. */
  skis: Layer;
  flutter: Flutter;
  /** Air rushing past in flight. */
  air: Layer;
  /** Wind in the background, always faintly there. */
  wind: Layer;
}

/** Sounds of single moments that only the audio needs (the phone does not buzz for them). */
export type SoundEvent = "push" | "countdown" | "disqualified";

const GROUND_FULL_SPEED_M_PER_S = 26;
const RUMBLE_Q = 0.7;
const TRACK_RUMBLE_MAX_GAIN = 0.22;
const TRACK_RUMBLE_BASE_HZ = 160;
const TRACK_RUMBLE_HZ_PER_M_PER_S = 20;
const TRACK_SKIS_MAX_GAIN = 0.2;
const TRACK_SKIS_BASE_HZ = 700;
const TRACK_SKIS_HZ_PER_M_PER_S = 70;
const TRACK_SKIS_Q = 3;
const TRACK_FLUTTER_BASE_HZ = 4;
const TRACK_FLUTTER_HZ_PER_M_PER_S = 0.9;
const TRACK_FLUTTER_DEPTH = 0.35;
const SNOW_RUMBLE_MAX_GAIN = 0.14;
const SNOW_RUMBLE_BASE_HZ = 140;
const SNOW_RUMBLE_HZ_PER_M_PER_S = 12;
const SNOW_SKIS_MAX_GAIN = 0.12;
const SNOW_SKIS_BASE_HZ = 2600;
const SNOW_SKIS_HZ_PER_M_PER_S = 55;
const SNOW_SKIS_Q = 0.9;
const AIR_MAX_GAIN = 0.2;
const AIR_FULL_SPEED_M_PER_S = 28;
const AIR_BASE_HZ = 600;
const AIR_HZ_PER_M_PER_S = 30;
const AIR_Q = 0.5;
const WIND_BASE_GAIN = 0.025;
const WIND_EXTRA_GAIN = 0.06;
const WIND_FULL_M_PER_S = 5;
const WIND_BASE_HZ = 220;
const WIND_HZ_PER_M_PER_S = 40;
const WIND_Q = 0.7;
/** Below this the skis are standing still. */
const MOVING_M_PER_S = 0.3;
/** The gate's countdown is heard from this many seconds before the time runs out. */
const COUNTDOWN_HEARD_FROM_S = 5;

const share = (v: number, full: number) => Math.min(1, Math.max(0, v / full));

function groundLayers(i: MixInput, loudness: number): Pick<Mix, "rumble" | "skis" | "flutter"> {
  const v = i.groundSpeedMPerS;
  const speed = share(v, GROUND_FULL_SPEED_M_PER_S);
  if (i.onTrack) {
    return {
      rumble: {
        gain: loudness * TRACK_RUMBLE_MAX_GAIN * speed,
        freqHz: TRACK_RUMBLE_BASE_HZ + v * TRACK_RUMBLE_HZ_PER_M_PER_S,
        q: RUMBLE_Q,
      },
      // The note comes in late: quiet while the skis are slow, clear near the takeoff.
      skis: {
        gain: loudness * TRACK_SKIS_MAX_GAIN * speed ** 1.5,
        freqHz: TRACK_SKIS_BASE_HZ + v * TRACK_SKIS_HZ_PER_M_PER_S,
        q: TRACK_SKIS_Q,
      },
      flutter: { rateHz: TRACK_FLUTTER_BASE_HZ + v * TRACK_FLUTTER_HZ_PER_M_PER_S, depth: TRACK_FLUTTER_DEPTH },
    };
  }
  return {
    rumble: {
      gain: loudness * SNOW_RUMBLE_MAX_GAIN * speed,
      freqHz: SNOW_RUMBLE_BASE_HZ + v * SNOW_RUMBLE_HZ_PER_M_PER_S,
      q: RUMBLE_Q,
    },
    skis: {
      gain: loudness * SNOW_SKIS_MAX_GAIN * speed,
      freqHz: SNOW_SKIS_BASE_HZ + v * SNOW_SKIS_HZ_PER_M_PER_S,
      q: SNOW_SKIS_Q,
    },
    flutter: { rateHz: TRACK_FLUTTER_BASE_HZ, depth: 0 },
  };
}

/** Gains and filter settings of the continuous layers for one frame. */
export function soundMix(i: MixInput): Mix {
  const quiet = i.paused ? 0 : 1;
  const sliding = !i.airborne && i.groundSpeedMPerS > MOVING_M_PER_S;
  return {
    ...groundLayers(i, sliding ? quiet : 0),
    air: {
      gain: i.airborne ? quiet * AIR_MAX_GAIN * share(i.airSpeedMPerS, AIR_FULL_SPEED_M_PER_S) : 0,
      freqHz: AIR_BASE_HZ + i.airSpeedMPerS * AIR_HZ_PER_M_PER_S,
      q: AIR_Q,
    },
    wind: {
      gain: quiet * (WIND_BASE_GAIN + WIND_EXTRA_GAIN * share(i.windMPerS, WIND_FULL_M_PER_S)),
      freqHz: WIND_BASE_HZ + i.windMPerS * WIND_HZ_PER_M_PER_S,
      q: WIND_Q,
    },
  };
}

/** Moments between two simulation states that have a sound of their own (output only). */
export function soundEvents(prev: JumpSimState, next: JumpSimState): SoundEvent[] {
  const events: SoundEvent[] = [];
  const before = prev.logic;
  const after = next.logic;
  // The push: the player's press that straightens the legs at the end of the inrun.
  if (before.phase < PHASE.takeoff && after.phase >= PHASE.takeoff && after.phase <= PHASE.flightHold)
    events.push("push");
  if (before.phase === PHASE.gate && after.phase === PHASE.gate) {
    if (!before.finished && after.finished) {
      events.push("disqualified");
    } else if (
      after.startCountdown < before.startCountdown &&
      after.startCountdown > 0 &&
      after.startCountdown <= COUNTDOWN_HEARD_FROM_S
    ) {
      events.push("countdown");
    }
  }
  return events;
}

/** Judges' notes that appear between two presentation frames (each judge has its own frame, as in the original). */
export function notesAppearing(logic: JumpLogicState, fromFrame: number, toFrame: number): { counted: boolean }[] {
  if (!logic.finished || !(logic.distanceM > 0)) return [];
  return logic.judges
    .filter((j) => j.showFrame > fromFrame && j.showFrame <= toFrame)
    .map((j) => ({ counted: j.counted }));
}
