import { describe, expect, it } from "vitest";
import { FRAME_DT_S } from "../sim/physics-constants";
import { LONG_FRAME_MS, METER_WINDOW_FRAMES, createFrameMeter, spreadOf, type FrameSample } from "./frame-meter";

/** A frame of a game that keeps up; the values are exact in single precision. */
const STEADY: FrameSample = { intervalMs: 16, simMs: 0.5, drawMs: 2, steps: 1, droppedS: 0 };

describe("spread of measurements", () => {
  it("is all zeros for no measurements", () => {
    expect(spreadOf([])).toEqual({ median: 0, p95: 0, max: 0 });
    expect(spreadOf(new Float32Array(0))).toEqual({ median: 0, p95: 0, max: 0 });
  });

  it("is the value itself for one measurement", () => {
    expect(spreadOf([7])).toEqual({ median: 7, p95: 7, max: 7 });
  });

  it("takes the median and the 95th percentile by nearest rank, whatever the order", () => {
    const oneToHundred = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(spreadOf(oneToHundred)).toEqual({ median: 50, p95: 95, max: 100 });
    expect(spreadOf([5, 1, 4, 2, 3])).toEqual({ median: 3, p95: 5, max: 5 });
    expect(spreadOf([4, 1, 3, 2])).toEqual({ median: 2, p95: 4, max: 4 });
    expect(spreadOf(Array.from({ length: 20 }, (_, i) => i + 1))).toEqual({ median: 10, p95: 19, max: 20 });
  });

  it("orders numbers as numbers and leaves the measurements as they were", () => {
    const values = [10, 9, 100, 1];
    expect(spreadOf(values)).toEqual({ median: 9, p95: 100, max: 100 });
    expect(values).toEqual([10, 9, 100, 1]);
    const typed = new Float32Array([3, 1, 2]);
    expect(spreadOf(typed)).toEqual({ median: 2, p95: 3, max: 3 });
    expect([...typed]).toEqual([3, 1, 2]);
  });
});

describe("frame meter", () => {
  it("starts with nothing counted", () => {
    const zero = { median: 0, p95: 0, max: 0 };
    expect(createFrameMeter().stats()).toEqual({
      frames: 0,
      steps: 0,
      droppedSteps: 0,
      cappedFrames: 0,
      longFrames: 0,
      intervalMs: zero,
      simMs: zero,
      drawMs: zero,
    });
  });

  it("counts frames and steps and spreads each measurement on its own", () => {
    const meter = createFrameMeter();
    meter.record({ intervalMs: 16, simMs: 0.5, drawMs: 2, steps: 1, droppedS: 0 });
    meter.record({ intervalMs: 32, simMs: 1.5, drawMs: 4, steps: 2, droppedS: 0 });
    meter.record({ intervalMs: 8, simMs: 0.25, drawMs: 3, steps: 0, droppedS: 0 });
    const stats = meter.stats();
    expect(stats.frames).toBe(3);
    expect(stats.steps).toBe(3);
    expect(stats.intervalMs).toEqual({ median: 16, p95: 32, max: 32 });
    expect(stats.simMs).toEqual({ median: 0.5, p95: 1.5, max: 1.5 });
    expect(stats.drawMs).toEqual({ median: 3, p95: 4, max: 4 });
  });

  it("turns dropped time into simulation steps and counts the frames that dropped any", () => {
    const meter = createFrameMeter();
    meter.record(STEADY);
    meter.record({ ...STEADY, steps: 8, droppedS: 3 * FRAME_DT_S });
    meter.record({ ...STEADY, steps: 8, droppedS: 1.5 * FRAME_DT_S });
    const stats = meter.stats();
    expect(stats.cappedFrames).toBe(2);
    expect(stats.droppedSteps).toBeCloseTo(4.5, 9);
  });

  it("counts the frames that came later than the limit, not the ones on it", () => {
    const meter = createFrameMeter();
    meter.record({ ...STEADY, intervalMs: LONG_FRAME_MS });
    meter.record({ ...STEADY, intervalMs: LONG_FRAME_MS + 1 });
    meter.record({ ...STEADY, intervalMs: 500 });
    expect(meter.stats().longFrames).toBe(2);
  });

  it("spreads the last frames only, and counts all of them", () => {
    const meter = createFrameMeter();
    meter.record({ ...STEADY, intervalMs: 900, simMs: 90, drawMs: 9 });
    for (let i = 0; i < METER_WINDOW_FRAMES - 1; i++) meter.record(STEADY);
    expect(meter.stats().intervalMs.max).toBe(900);
    meter.record(STEADY);
    const stats = meter.stats();
    expect(stats.frames).toBe(METER_WINDOW_FRAMES + 1);
    expect(stats.longFrames).toBe(1);
    expect(stats.intervalMs).toEqual({ median: 16, p95: 16, max: 16 });
    expect(stats.simMs).toEqual({ median: 0.5, p95: 0.5, max: 0.5 });
    expect(stats.drawMs).toEqual({ median: 2, p95: 2, max: 2 });
  });

  it("keeps the window full as it turns over", () => {
    const meter = createFrameMeter();
    for (let i = 0; i < METER_WINDOW_FRAMES; i++) meter.record(STEADY);
    // Half of the window is replaced: the median sits on the boundary, the top belongs to the new frames.
    for (let i = 0; i < METER_WINDOW_FRAMES / 2; i++) meter.record({ ...STEADY, intervalMs: 32 });
    expect(meter.stats().intervalMs).toEqual({ median: 16, p95: 32, max: 32 });
    meter.record({ ...STEADY, intervalMs: 32 });
    expect(meter.stats().intervalMs.median).toBe(32);
  });

  it("leaves out exactly one frame when asked to discard the next", () => {
    const meter = createFrameMeter();
    meter.record(STEADY);
    meter.discardNext();
    meter.discardNext();
    meter.record({ intervalMs: 4000, simMs: 50, drawMs: 50, steps: 8, droppedS: 3 });
    expect(meter.stats().frames).toBe(1);
    expect(meter.stats().steps).toBe(1);
    expect(meter.stats().droppedSteps).toBe(0);
    expect(meter.stats().longFrames).toBe(0);
    expect(meter.stats().intervalMs.max).toBe(16);
    meter.record({ ...STEADY, intervalMs: 24 });
    expect(meter.stats().frames).toBe(2);
    expect(meter.stats().intervalMs.max).toBe(24);
  });

  it("forgets everything on reset, a pending discard too", () => {
    const meter = createFrameMeter();
    meter.record({ intervalMs: 80, simMs: 5, drawMs: 6, steps: 8, droppedS: 1 });
    meter.discardNext();
    meter.reset();
    expect(meter.stats()).toEqual(createFrameMeter().stats());
    meter.record(STEADY);
    expect(meter.stats().frames).toBe(1);
    expect(meter.stats().intervalMs).toEqual({ median: 16, p95: 16, max: 16 });
  });
});
