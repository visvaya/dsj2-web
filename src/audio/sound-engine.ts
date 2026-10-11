import type { FeedbackEvent } from "../game/haptics";
import type { Mix } from "./sound-mix";

/**
 * Game sounds made in the browser (Web Audio): filtered noise for skis, air and wind, short synthesised cues
 * for the jump's moments. No recordings, so nothing to license. The engine only plays what it is told.
 */
export type SoundCue = FeedbackEvent | "noteCounted" | "noteDropped" | "record";

/** The parts of the Web Audio API the engine uses (a real AudioContext fits; tests pass a stand-in). */
export interface ParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, timeConstant: number): unknown;
}
export interface NodeLike {
  connect(destination: NodeLike): unknown;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface FilterLike extends NodeLike {
  type: BiquadFilterType;
  frequency: ParamLike;
  Q: ParamLike;
}
export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  start(when?: number, offset?: number, duration?: number): void;
}
export interface OscillatorLike extends NodeLike {
  type: OscillatorType;
  frequency: ParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface ContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): SourceLike;
  createOscillator(): OscillatorLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface SoundEngine {
  /** Call from a user gesture: browsers only start audio after one. */
  unlock(): void;
  setEnabled(on: boolean): void;
  update(mix: Mix): void;
  play(cue: SoundCue): void;
  dispose(): void;
}

const NOISE_SECONDS = 2;
/** How quickly continuous layers follow the game (seconds to about two thirds of the way). */
const FOLLOW_S = 0.06;
const SILENT = 0.0001;

function defaultContext(): ContextLike | null {
  if (typeof AudioContext === "undefined") return null;
  playThroughSilentSwitch();
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/**
 * iOS mutes web audio with the ring/silent switch unless the page asks for media playback (Audio Session API,
 * Safari 17+). The game has its own sound switch, so the phone's ringer setting does not silence it.
 */
function playThroughSilentSwitch(): void {
  const session: unknown = typeof navigator === "undefined" ? undefined : Reflect.get(navigator, "audioSession");
  if (typeof session !== "object" || session === null) return;
  try {
    Reflect.set(session, "type", "playback");
  } catch {
    // Not settable here: the ringer switch keeps its usual effect.
  }
}

/** White noise from a fixed linear congruential generator (the same hiss every time). */
function fillNoise(buffer: BufferLike, length: number): void {
  const data = buffer.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = s / 0x80000000 - 1;
  }
}

/** A short envelope: up to `peak` in `attack`, then down to silence over `decay`. */
function envelope(param: ParamLike, t: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(SILENT, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

interface ContinuousLayer {
  filter: FilterLike;
  gain: GainLike;
}

export function createSoundEngine(makeContext: () => ContextLike | null = defaultContext): SoundEngine {
  let ctx: ContextLike | null = null;
  let master: GainLike | null = null;
  let noise: BufferLike | null = null;
  let layers: Record<keyof Mix, ContinuousLayer> | null = null;
  let enabled = true;

  const build = (c: ContextLike) => {
    master = c.createGain();
    master.gain.setValueAtTime(enabled ? 1 : 0, c.currentTime);
    master.connect(c.destination);
    const length = Math.round(c.sampleRate * NOISE_SECONDS);
    noise = c.createBuffer(1, length, c.sampleRate);
    fillNoise(noise, length);
    const layer = (type: BiquadFilterType, q: number): ContinuousLayer => {
      const source = c.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.Q.setValueAtTime(q, c.currentTime);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, c.currentTime);
      source.connect(filter);
      filter.connect(gain);
      if (master) gain.connect(master);
      source.start();
      return { filter, gain };
    };
    layers = { skis: layer("bandpass", 0.8), air: layer("bandpass", 0.5), wind: layer("lowpass", 0.7) };
  };

  const burst = (c: ContextLike, t: number, type: BiquadFilterType, freqHz: number, peak: number, seconds: number) => {
    if (!master || !noise) return;
    const source = c.createBufferSource();
    source.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freqHz, t);
    const gain = c.createGain();
    envelope(gain.gain, t, peak, 0.005, seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, (t * 0.37) % (NOISE_SECONDS - 0.5), seconds + 0.05);
  };

  const tone = (c: ContextLike, t: number, type: OscillatorType, fromHz: number, toHz: number, peak: number, seconds: number) => {
    if (!master) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t);
    if (toHz !== fromHz) osc.frequency.exponentialRampToValueAtTime(toHz, t + seconds);
    const gain = c.createGain();
    envelope(gain.gain, t, peak, 0.005, seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  };

  return {
    unlock() {
      if (!ctx) {
        ctx = makeContext();
        if (!ctx) return;
        build(ctx);
      }
      // iOS leaves a context "suspended" or "interrupted"; anything but running is resumed inside the gesture.
      if (ctx.state === "running") return;
      ctx.resume().catch(() => undefined);
      // Starting a sound inside the gesture is what finally unlocks audio on older iOS.
      if (master && noise) {
        const tick = ctx.createBufferSource();
        tick.buffer = noise;
        const hush = ctx.createGain();
        hush.gain.setValueAtTime(0, ctx.currentTime);
        tick.connect(hush);
        hush.connect(master);
        tick.start(ctx.currentTime, 0, 0.01);
      }
    },
    setEnabled(on) {
      enabled = on;
      if (ctx && master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, FOLLOW_S);
    },
    update(mix) {
      if (!ctx || !layers) return;
      const t = ctx.currentTime;
      for (const key of ["skis", "air", "wind"] as const) {
        layers[key].gain.gain.setTargetAtTime(mix[key].gain, t, FOLLOW_S);
        layers[key].filter.frequency.setTargetAtTime(mix[key].freqHz, t, FOLLOW_S);
      }
    },
    play(cue) {
      const c = ctx;
      if (!c || !enabled) return;
      const t = c.currentTime + 0.01;
      switch (cue) {
        case "start":
          burst(c, t, "highpass", 2500, 0.12, 0.03);
          break;
        case "takeoff":
          burst(c, t, "bandpass", 900, 0.25, 0.12);
          tone(c, t, "sine", 140, 70, 0.3, 0.12);
          break;
        case "landing":
          tone(c, t, "sine", 100, 45, 0.45, 0.22);
          burst(c, t, "lowpass", 600, 0.28, 0.18);
          break;
        case "crash":
          tone(c, t, "sine", 100, 40, 0.55, 0.25);
          tone(c, t + 0.15, "sine", 80, 35, 0.45, 0.3);
          burst(c, t, "lowpass", 500, 0.35, 0.4);
          break;
        case "noteCounted":
          tone(c, t, "square", 880, 880, 0.07, 0.07);
          break;
        case "noteDropped":
          tone(c, t, "square", 587, 587, 0.06, 0.07);
          break;
        case "record":
          [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => tone(c, t + i * 0.11, "square", hz, hz, 0.07, 0.1));
          break;
      }
    },
    dispose() {
      const c = ctx;
      ctx = null;
      layers = null;
      master = null;
      if (c) c.close().catch(() => undefined);
    },
  };
}
