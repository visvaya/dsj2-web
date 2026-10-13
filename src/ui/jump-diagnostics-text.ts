import type { FrameStats, Spread } from "../game/frame-meter";

const MS_PER_S = 1000;

/** One decimal place with a decimal point, as the numbers in the picture of the jump. */
const number = (value: number): string => value.toFixed(1);
const spread = (s: Spread): string => `${number(s.median)} / ${number(s.p95)} / ${number(s.max)}`;

/**
 * The lines of the diagnostics overlay: frames per second from the median interval, then the interval between
 * frames, the cost of the simulation and of the drawing (each as median / 95th percentile / maximum, in
 * milliseconds), then the simulation steps dropped and the long frames.
 */
export function diagnosticsLines(stats: FrameStats): readonly string[] {
  const medianMs = stats.intervalMs.median;
  const framesPerS = medianMs > 0 ? MS_PER_S / medianMs : 0;
  return [
    `${number(framesPerS)} kl./s`,
    `klatka ${spread(stats.intervalMs)} ms`,
    `sym. ${spread(stats.simMs)} · rys. ${spread(stats.drawMs)} ms`,
    `zgubione kroki ${number(stats.droppedSteps)} · długie klatki ${stats.longFrames}`,
  ];
}
