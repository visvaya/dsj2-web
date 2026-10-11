import { describe, expect, it } from "vitest";
import { createSoundEngine, type BufferLike, type ContextLike, type FilterLike, type GainLike, type NodeLike, type OscillatorLike, type ParamLike, type SourceLike } from "./sound-engine";
import { soundMix } from "./sound-mix";

/** Records what the engine asks of Web Audio. */
class FakeParam implements ParamLike {
  target = 0;
  setValueAtTime(v: number) {
    this.target = v;
  }
  linearRampToValueAtTime(v: number) {
    this.target = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.target = v;
  }
  setTargetAtTime(v: number) {
    this.target = v;
  }
}

class FakeContext implements ContextLike {
  currentTime = 1;
  sampleRate = 8000;
  state = "suspended";
  resumed = 0;
  closed = false;
  started = 0;
  oscillators = 0;
  readonly destination: NodeLike = { connect: () => undefined };
  readonly gains: GainLike[] = [];
  createGain(): GainLike {
    const g = { gain: new FakeParam(), connect: () => undefined };
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FilterLike {
    return { type: "lowpass", frequency: new FakeParam(), Q: new FakeParam(), connect: () => undefined };
  }
  createBufferSource(): SourceLike {
    return { buffer: null, loop: false, connect: () => undefined, start: () => void this.started++ };
  }
  createOscillator(): OscillatorLike {
    this.oscillators++;
    return { type: "sine", frequency: new FakeParam(), connect: () => undefined, start: () => undefined, stop: () => undefined };
  }
  createBuffer(_channels: number, length: number): BufferLike {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {
    this.resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const gainOf = (g: GainLike | undefined) => (g?.gain instanceof FakeParam ? g.gain.target : NaN);

describe("sound engine", () => {
  it("stays silent until a gesture unlocks it, then starts the continuous layers once", () => {
    const fake = new FakeContext();
    let made = 0;
    const engine = createSoundEngine(() => {
      made++;
      return fake;
    });
    engine.play("takeoff");
    engine.update(soundMix({ airborne: false, groundSpeedMPerS: 20, airSpeedMPerS: 0, windMPerS: 2, paused: false }));
    expect(made).toBe(0);
    engine.unlock();
    engine.unlock();
    expect(made).toBe(1);
    expect(fake.resumed).toBe(1);
    // Skis, air and wind loop from the start (made louder or quieter afterwards), plus one silent tick that
    // unlocks iOS; once running, further gestures start nothing.
    expect(fake.started).toBe(4);
  });

  it("follows the mix and plays cues only while enabled", () => {
    const fake = new FakeContext();
    const engine = createSoundEngine(() => fake);
    engine.unlock();
    // Gains: master, then one per layer (skis, air, wind).
    engine.update(soundMix({ airborne: false, groundSpeedMPerS: 20, airSpeedMPerS: 0, windMPerS: 2, paused: false }));
    expect(gainOf(fake.gains[1])).toBeGreaterThan(0);
    expect(gainOf(fake.gains[2])).toBe(0);
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

  it("does nothing where the browser has no Web Audio", () => {
    const engine = createSoundEngine(() => null);
    expect(() => {
      engine.unlock();
      engine.play("crash");
      engine.update(soundMix({ airborne: true, groundSpeedMPerS: 0, airSpeedMPerS: 25, windMPerS: 3, paused: false }));
      engine.dispose();
    }).not.toThrow();
  });
});
