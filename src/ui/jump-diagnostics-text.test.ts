import { describe, expect, it } from "vitest";
import { createFrameMeter, type FrameStats } from "../game/frame-meter";
import { diagnosticsLines } from "./jump-diagnostics-text";

const STATS: FrameStats = {
  frames: 600,
  steps: 700,
  droppedSteps: 2.5,
  cappedFrames: 1,
  longFrames: 3,
  intervalMs: { median: 16.7, p95: 18.04, max: 120 },
  simMs: { median: 0.1, p95: 0.26, max: 1 },
  drawMs: { median: 1.44, p95: 2, max: 7.96 },
};

describe("text of the diagnostics overlay", () => {
  it("gives the frame rate, the frame interval, the two costs and the losses, with decimal points", () => {
    expect(diagnosticsLines(STATS)).toEqual([
      "59.9 kl./s",
      "klatka 16.7 / 18.0 / 120.0 ms",
      "sym. 0.1 / 0.3 / 1.0 · rys. 1.4 / 2.0 / 8.0 ms",
      "zgubione kroki 2.5 · długie klatki 3",
    ]);
  });

  it("shows zeros before the first frame instead of dividing by zero", () => {
    expect(diagnosticsLines(createFrameMeter().stats())).toEqual([
      "0.0 kl./s",
      "klatka 0.0 / 0.0 / 0.0 ms",
      "sym. 0.0 / 0.0 / 0.0 · rys. 0.0 / 0.0 / 0.0 ms",
      "zgubione kroki 0.0 · długie klatki 0",
    ]);
  });

  it("stays within four short lines", () => {
    const lines = diagnosticsLines({ ...STATS, droppedSteps: 12345.6, longFrames: 99999 });
    expect(lines.length).toBeLessThanOrEqual(4);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(48);
  });
});
