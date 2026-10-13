import { FRAME_DT_S } from "../sim/physics-constants";

/** How many of the latest frames the spreads are taken from: about a minute at 60 frames a second. */
export const METER_WINDOW_FRAMES = 4096;
/** A frame that comes later than this after the one before it is counted as long: three frames of a 60 Hz screen. */
export const LONG_FRAME_MS = 50;

const MEDIAN_SHARE = 0.5;
const P95_SHARE = 0.95;

/** What the jump loop measured in one frame. */
export interface FrameSample {
  /** Time since the frame before, by the browser's frame clock. */
  intervalMs: number;
  /** Time all the simulation steps of the frame took. */
  simMs: number;
  /** Time it took to draw into the buffer and to send the picture to the canvas. */
  drawMs: number;
  /** Simulation steps taken in the frame. */
  steps: number;
  /** Time the frame dropped (`planSteps`). */
  droppedS: number;
}

export interface Spread {
  median: number;
  p95: number;
  max: number;
}

export interface FrameStats {
  /** Frames counted since the last reset. */
  frames: number;
  steps: number;
  /** Dropped time in simulation steps of 1/70 s; a fraction is possible. */
  droppedSteps: number;
  /** Frames that dropped any time. */
  cappedFrames: number;
  /** Frames that came more than `LONG_FRAME_MS` after the one before. */
  longFrames: number;
  /** The spreads cover the last `METER_WINDOW_FRAMES` frames. */
  intervalMs: Spread;
  simMs: Spread;
  drawMs: Spread;
}

export interface FrameMeter {
  record(sample: FrameSample): void;
  /** The next sample is not counted: the frame after a return from the background has an interval the game did not cause. */
  discardNext(): void;
  stats(): FrameStats;
  reset(): void;
}

/** Median, 95th percentile (nearest rank) and maximum of the values; zeros when there are none. */
export function spreadOf(values: readonly number[] | Float32Array): Spread {
  const count = values.length;
  if (count === 0) return { median: 0, p95: 0, max: 0 };
  const sorted = Float64Array.from(values).toSorted();
  const atShare = (share: number): number => sorted[Math.max(1, Math.ceil(share * count)) - 1] ?? 0;
  return { median: atShare(MEDIAN_SHARE), p95: atShare(P95_SHARE), max: sorted[count - 1] ?? 0 };
}

/** Collects what the frames of a jump cost. It reads no clock itself and allocates nothing while recording. */
export function createFrameMeter(): FrameMeter {
  const intervalsMs = new Float32Array(METER_WINDOW_FRAMES);
  const simsMs = new Float32Array(METER_WINDOW_FRAMES);
  const drawsMs = new Float32Array(METER_WINDOW_FRAMES);
  let frames = 0;
  let steps = 0;
  let droppedS = 0;
  let cappedFrames = 0;
  let longFrames = 0;
  let discarding = false;

  return {
    record(sample) {
      if (discarding) {
        discarding = false;
        return;
      }
      const slot = frames % METER_WINDOW_FRAMES;
      intervalsMs[slot] = sample.intervalMs;
      simsMs[slot] = sample.simMs;
      drawsMs[slot] = sample.drawMs;
      frames += 1;
      steps += sample.steps;
      droppedS += sample.droppedS;
      if (sample.droppedS > 0) cappedFrames += 1;
      if (sample.intervalMs > LONG_FRAME_MS) longFrames += 1;
    },
    discardNext() {
      discarding = true;
    },
    stats() {
      const filled = Math.min(frames, METER_WINDOW_FRAMES);
      return {
        frames,
        steps,
        droppedSteps: droppedS / FRAME_DT_S,
        cappedFrames,
        longFrames,
        intervalMs: spreadOf(intervalsMs.subarray(0, filled)),
        simMs: spreadOf(simsMs.subarray(0, filled)),
        drawMs: spreadOf(drawsMs.subarray(0, filled)),
      };
    },
    reset() {
      frames = 0;
      steps = 0;
      droppedS = 0;
      cappedFrames = 0;
      longFrames = 0;
      discarding = false;
    },
  };
}
