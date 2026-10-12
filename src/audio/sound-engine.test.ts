import { describe, expect, it } from "vitest";
import {
  createSoundEngine,
  type BufferLike,
  type ContextLike,
  type FilterLike,
  type GainLike,
  type NodeLike,
  type OscillatorLike,
  type ParamLike,
  type SourceLike,
} from "./sound-engine";
import { soundMix } from "./sound-mix";

/** Records what the engine asks of Web Audio. */
interface FakeParam extends ParamLike {
  readonly target: number;
}

function fakeParam(): FakeParam {
  let target = 0;
  const follow = (v: number): void => {
    target = v;
  };
  return {
    get target() {
      return target;
    },
    setValueAtTime: follow,
    linearRampToValueAtTime: follow,
    exponentialRampToValueAtTime: follow,
    setTargetAtTime: follow,
  };
}

interface FakeGain extends GainLike {
  readonly gain: FakeParam;
}

interface FakeContext extends ContextLike {
  readonly resumed: number;
  readonly closed: boolean;
  readonly started: number;
  readonly oscillators: number;
  readonly gains: readonly FakeGain[];
}

function fakeContext(): FakeContext {
  let state = "suspended";
  let resumed = 0;
  let closed = false;
  let started = 0;
  let oscillators = 0;
  const destination: NodeLike = { connect: () => undefined };
  const gains: FakeGain[] = [];
  return {
    currentTime: 1,
    sampleRate: 8000,
    destination,
    gains,
    get state() {
      return state;
    },
    get resumed() {
      return resumed;
    },
    get closed() {
      return closed;
    },
    get started() {
      return started;
    },
    get oscillators() {
      return oscillators;
    },
    createGain(): GainLike {
      const g = { gain: fakeParam(), connect: () => undefined };
      gains.push(g);
      return g;
    },
    createBiquadFilter(): FilterLike {
      return { type: "lowpass", frequency: fakeParam(), Q: fakeParam(), connect: () => undefined };
    },
    createBufferSource(): SourceLike {
      return { buffer: null, loop: false, connect: () => undefined, start: () => void started++ };
    },
    createOscillator(): OscillatorLike {
      oscillators++;
      return {
        type: "sine",
        frequency: fakeParam(),
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createBuffer(_channels: number, length: number): BufferLike {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    resume() {
      resumed++;
      state = "running";
      return Promise.resolve();
    },
    close() {
      closed = true;
      return Promise.resolve();
    },
  };
}

const gainOf = (g: FakeGain | undefined) => g?.gain.target ?? NaN;

describe("sound engine", () => {
  it("stays silent until a gesture unlocks it, then starts the continuous layers once", () => {
    const fake = fakeContext();
    let made = 0;
    const engine = createSoundEngine(() => {
      made++;
      return fake;
    });
    engine.play("takeoff");
    engine.update(
      soundMix({ airborne: false, onTrack: true, groundSpeedMPerS: 20, airSpeedMPerS: 0, windMPerS: 2, paused: false }),
    );
    expect(made).toBe(0);
    engine.unlock();
    engine.unlock();
    expect(made).toBe(1);
    expect(fake.resumed).toBe(1);
    // Rumble, skis, air and wind loop from the start (made louder or quieter afterwards), plus one silent tick
    // that unlocks iOS; once running, further gestures start nothing.
    expect(fake.started).toBe(5);
  });

  it("follows the mix and plays cues only while enabled", () => {
    const fake = fakeContext();
    const engine = createSoundEngine(() => fake);
    engine.unlock();
    // Gains: master, the ground layers' shared gain, the depth of its flutter, then one per layer (rumble, skis,
    // air, wind).
    engine.update(
      soundMix({ airborne: false, onTrack: true, groundSpeedMPerS: 20, airSpeedMPerS: 0, windMPerS: 2, paused: false }),
    );
    expect(gainOf(fake.gains[2])).toBeGreaterThan(0);
    expect(gainOf(fake.gains[1])).toBeLessThan(1);
    expect(gainOf(fake.gains[3])).toBeGreaterThan(0);
    expect(gainOf(fake.gains[4])).toBeGreaterThan(0);
    expect(gainOf(fake.gains[5])).toBe(0);
    // On the snow of the outrun the flutter stops.
    engine.update(
      soundMix({
        airborne: false,
        onTrack: false,
        groundSpeedMPerS: 20,
        airSpeedMPerS: 0,
        windMPerS: 2,
        paused: false,
      }),
    );
    expect(gainOf(fake.gains[2])).toBe(0);
    expect(gainOf(fake.gains[1])).toBe(1);
    engine.play("landing");
    const afterLanding = fake.oscillators;
    expect(afterLanding).toBeGreaterThan(0);
    engine.setEnabled(false);
    expect(gainOf(fake.gains[0])).toBe(0);
    engine.play("record");
    expect(fake.oscillators).toBe(afterLanding);
    engine.dispose();
    expect(fake.closed).toBe(true);
  });

  it("has a sound for every cue", () => {
    const cues = [
      "start",
      "push",
      "takeoff",
      "landing",
      "crash",
      "countdown",
      "disqualified",
      "noteCounted",
      "noteDropped",
      "record",
    ] as const;
    const silent = cues.filter((cue) => {
      const fake = fakeContext();
      const engine = createSoundEngine(() => fake);
      engine.unlock();
      const before = fake.started + fake.oscillators;
      engine.play(cue);
      return fake.started + fake.oscillators === before;
    });
    expect(silent).toEqual([]);
  });

  it("does nothing where the browser has no Web Audio", () => {
    const engine = createSoundEngine(() => null);
    expect(() => {
      engine.unlock();
      engine.play("crash");
      engine.update(
        soundMix({
          airborne: true,
          onTrack: false,
          groundSpeedMPerS: 0,
          airSpeedMPerS: 25,
          windMPerS: 3,
          paused: false,
        }),
      );
      engine.dispose();
    }).not.toThrow();
  });
});
