import type { FeedbackEvent } from "../game/haptics";
import type { Layer, Mix, SoundEvent } from "./sound-mix";

/**
 * Game sounds made in the browser (Web Audio): filtered noise for skis, air and wind, short synthesised cues
 * for the jump's moments. No recordings, so nothing to license. The engine only plays what it is told.
 */
type SoundCue = FeedbackEvent | SoundEvent | "noteCounted" | "noteDropped" | "record";

/** The parts of the Web Audio API the engine uses (a real AudioContext fits; tests pass a stand-in). */
export interface ParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, timeConstant: number): unknown;
}
export interface NodeLike {
  /** To another node, or to a parameter that the signal then moves (the flutter of the ground layers). */
  connect(destination: NodeLike | ParamLike): unknown;
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

/** How far each sample of the deep noise moves towards a new random value. */
const DEEP_NOISE_STEP = 0.1;
const DEEP_NOISE_PEAK = 0.9;

/**
 * Deep noise for the rumble: white noise run through a leaky sum, so most of its energy sits low and it sounds
 * like a rumble where white noise sounds like radio static. The ends are joined so the loop does not click.
 */
function fillDeepNoise(buffer: BufferLike, length: number): void {
  const data = buffer.getChannelData(0);
  let s = 0x7f4a7c15;
  let level = 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    level = (level + DEEP_NOISE_STEP * (s / 0x80000000 - 1)) / (1 + DEEP_NOISE_STEP);
    data[i] = level;
  }
  const drift = length > 1 ? ((data[length - 1] ?? 0) - (data[0] ?? 0)) / (length - 1) : 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const v = (data[i] ?? 0) - drift * i;
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak === 0) return;
  for (let i = 0; i < length; i++) data[i] = ((data[i] ?? 0) / peak) * DEEP_NOISE_PEAK;
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

/** The shared gain of the ground layers and the slow wave that pulses it. */
interface FlutterNodes {
  bus: GainLike;
  wave: OscillatorLike;
  depth: GainLike;
}

const LAYER_KEYS = ["rumble", "skis", "air", "wind"] as const;

export function createSoundEngine(makeContext: () => ContextLike | null = defaultContext): SoundEngine {
  let ctx: ContextLike | null = null;
  let master: GainLike | null = null;
  let noise: BufferLike | null = null;
  let layers: Record<(typeof LAYER_KEYS)[number], ContinuousLayer> | null = null;
  let flutter: FlutterNodes | null = null;
  let enabled = true;

  const build = (c: ContextLike) => {
    master = c.createGain();
    master.gain.setValueAtTime(enabled ? 1 : 0, c.currentTime);
    master.connect(c.destination);
    const length = Math.round(c.sampleRate * NOISE_SECONDS);
    noise = c.createBuffer(1, length, c.sampleRate);
    fillNoise(noise, length);
    const deepNoise = c.createBuffer(1, length, c.sampleRate);
    fillDeepNoise(deepNoise, length);
    // The ground layers share one gain; a slow wave added to it makes the track chatter.
    const bus = c.createGain();
    bus.gain.setValueAtTime(1, c.currentTime);
    bus.connect(master);
    const wave = c.createOscillator();
    wave.type = "sine";
    wave.frequency.setValueAtTime(1, c.currentTime);
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, c.currentTime);
    wave.connect(depth);
    depth.connect(bus.gain);
    wave.start();
    flutter = { bus, wave, depth };
    const layer = (buffer: BufferLike, type: BiquadFilterType, out: NodeLike): ContinuousLayer => {
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = type;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, c.currentTime);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      source.start();
      return { filter, gain };
    };
    layers = {
      rumble: layer(deepNoise, "lowpass", bus),
      skis: layer(noise, "bandpass", bus),
      air: layer(noise, "bandpass", master),
      wind: layer(noise, "lowpass", master),
    };
  };

  /** A short piece of noise through a filter that may sweep from one frequency to another. */
  const burst = (
    c: ContextLike,
    t: number,
    type: BiquadFilterType,
    fromHz: number,
    toHz: number,
    peak: number,
    seconds: number,
  ) => {
    if (!master || !noise) return;
    const source = c.createBufferSource();
    source.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(fromHz, t);
    if (toHz !== fromHz) filter.frequency.exponentialRampToValueAtTime(toHz, t + seconds);
    const gain = c.createGain();
    envelope(gain.gain, t, peak, 0.005, seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, (t * 0.37) % (NOISE_SECONDS - 1), seconds + 0.05);
  };

  const tone = (
    c: ContextLike,
    t: number,
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    peak: number,
    seconds: number,
  ) => {
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
      for (const key of LAYER_KEYS) {
        const target: Layer = mix[key];
        layers[key].gain.gain.setTargetAtTime(target.gain, t, FOLLOW_S);
        layers[key].filter.frequency.setTargetAtTime(target.freqHz, t, FOLLOW_S);
        layers[key].filter.Q.setTargetAtTime(target.q, t, FOLLOW_S);
      }
      if (flutter) {
        // The wave swings the shared gain between 1 - depth and 1.
        flutter.wave.frequency.setTargetAtTime(mix.flutter.rateHz, t, FOLLOW_S);
        flutter.depth.gain.setTargetAtTime(mix.flutter.depth / 2, t, FOLLOW_S);
        flutter.bus.gain.setTargetAtTime(1 - mix.flutter.depth / 2, t, FOLLOW_S);
      }
    },
    play(cue) {
      const c = ctx;
      if (!c || !enabled) return;
      const t = c.currentTime + 0.01;
      switch (cue) {
        case "start":
          // The bar lets go: a click and a short wooden knock.
          burst(c, t, "highpass", 2500, 2500, 0.12, 0.03);
          tone(c, t, "sine", 190, 95, 0.16, 0.09);
          break;
        case "push":
          // The legs straighten: a rising swish over a short thump.
          burst(c, t, "bandpass", 450, 1900, 0.24, 0.14);
          tone(c, t, "sine", 170, 85, 0.3, 0.1);
          break;
        case "takeoff":
          // The skis leave the track: the air closes in.
          burst(c, t, "bandpass", 1400, 500, 0.2, 0.32);
          tone(c, t, "sine", 120, 60, 0.14, 0.1);
          break;
        case "landing":
          tone(c, t, "sine", 100, 45, 0.45, 0.22);
          burst(c, t, "lowpass", 600, 600, 0.28, 0.18);
          // Snow thrown up by the skis.
          burst(c, t, "bandpass", 3200, 1400, 0.14, 0.45);
          break;
        case "crash":
          tone(c, t, "sine", 100, 40, 0.55, 0.25);
          tone(c, t + 0.15, "sine", 80, 35, 0.45, 0.3);
          burst(c, t, "lowpass", 500, 500, 0.35, 0.4);
          // The slide on the snow.
          burst(c, t + 0.1, "bandpass", 900, 300, 0.2, 0.7);
          break;
        case "countdown":
          tone(c, t, "square", 440, 440, 0.035, 0.05);
          break;
        case "disqualified":
          tone(c, t, "square", 196, 196, 0.06, 0.18);
          tone(c, t + 0.2, "square", 147, 147, 0.06, 0.3);
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
      flutter = null;
      master = null;
      if (c) c.close().catch(() => undefined);
    },
  };
}
