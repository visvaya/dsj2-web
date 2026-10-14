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
  readonly suspended: number;
  readonly closed: boolean;
  readonly started: number;
  readonly oscillators: number;
  readonly gains: readonly FakeGain[];
}

/**
 * `startState` is the state a new context has: "suspended" where the page has not been touched yet, "running"
 * where the browser lets audio start without a gesture. A suspend takes effect only when `settle` is true,
 * as a real one does a moment later.
 */
function fakeContext({ startState = "suspended", settle = true } = {}): FakeContext {
  let state = startState;
  let resumed = 0;
  let suspended = 0;
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
    get suspended() {
      return suspended;
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
    suspend() {
      suspended++;
      if (settle) state = "suspended";
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

  it("is prepared before any gesture, so that a gesture only resumes it", () => {
    const fake = fakeContext();
    let made = 0;
    const engine = createSoundEngine(() => {
      made++;
      return fake;
    });
    engine.prepare();
    // The context and the continuous layers exist, still silent.
    expect(made).toBe(1);
    expect(fake.started).toBe(4);
    expect(fake.resumed).toBe(0);
    engine.unlock();
    expect(made).toBe(1);
    expect(fake.resumed).toBe(1);
    expect(fake.started).toBe(5);
  });

  it("keeps a context that the browser started on its own silent until the first gesture", () => {
    const fake = fakeContext({ startState: "running" });
    const engine = createSoundEngine(() => fake);
    engine.prepare();
    expect(fake.suspended).toBe(1);
    expect(fake.state).toBe("suspended");
    engine.unlock();
    expect(fake.state).toBe("running");
  });

  it("asks a context that has not started yet to stay suspended: some browsers start it a moment later", () => {
    const fake = fakeContext();
    const engine = createSoundEngine(() => fake);
    engine.prepare();
    expect(fake.suspended).toBe(1);
    engine.unlock();
    expect(fake.resumed).toBe(1);
  });

  it("stops while the page is hidden and goes on when it is back, once a gesture has started it", () => {
    const fake = fakeContext();
    const engine = createSoundEngine(() => fake);
    engine.prepare();
    // Hidden before any gesture: suspended, and back in view it still waits for a gesture.
    engine.setHidden(true);
    engine.setHidden(false);
    expect(fake.resumed).toBe(0);
    engine.unlock();
    expect(fake.state).toBe("running");
    engine.setHidden(true);
    expect(fake.state).toBe("suspended");
    engine.setHidden(false);
    expect(fake.state).toBe("running");
  });

  it("resumes at the first gesture even while its suspend has not taken effect yet", () => {
    const fake = fakeContext({ startState: "running", settle: false });
    const engine = createSoundEngine(() => fake);
    engine.prepare();
    expect(fake.state).toBe("running");
    engine.unlock();
    expect(fake.resumed).toBe(1);
    // Once resumed and running, further gestures leave it alone.
    engine.unlock();
    expect(fake.resumed).toBe(1);
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
      engine.prepare();
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
