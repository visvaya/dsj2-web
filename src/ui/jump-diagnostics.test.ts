import { describe, expect, it } from "vitest";
import type { FrameStats } from "../game/frame-meter";
import { OVERLAY_REFRESH_MS, createJumpDiagnostics } from "./jump-diagnostics";

interface Shown {
  text: string;
  stats: FrameStats;
}

/** Diagnostics on a clock the test moves, with what they showed so far. */
function setUp() {
  let nowMs = 0;
  const shown: Shown[] = [];
  const diagnostics = createJumpDiagnostics(
    (text, stats) => shown.push({ text, stats }),
    () => nowMs,
  );
  /** One frame of the loop at `frameMs`: the steps take `simMs`, other work `betweenMs`, the drawing `drawMs`. */
  const frame = (frameMs: number, cost: { simMs: number; betweenMs?: number; drawMs: number }, paused = false) => {
    nowMs = frameMs;
    diagnostics.stepsBegin();
    nowMs += cost.simMs;
    diagnostics.stepsEnd();
    nowMs += cost.betweenMs ?? 0;
    diagnostics.drawBegin();
    nowMs += cost.drawMs;
    diagnostics.frameEnd(frameMs, { steps: 1, droppedS: 0 }, paused);
  };
  const latest = (): Shown => {
    const last = shown.at(-1);
    if (!last) throw new Error("nothing was shown");
    return last;
  };
  return { diagnostics, frame, shown, latest };
}

describe("diagnostics of the jump loop", () => {
  it("shows the overlay with the first frame, before there is anything to measure an interval from", () => {
    const { frame, shown, latest } = setUp();
    frame(1000, { simMs: 1, drawMs: 2 });
    expect(shown).toHaveLength(1);
    expect(latest().stats.frames).toBe(0);
    expect(latest().text.split("\n")).toHaveLength(4);
  });

  it("measures the interval between frames, the steps and the drawing, and nothing in between", () => {
    const { frame, latest } = setUp();
    frame(1000, { simMs: 1, drawMs: 2 });
    frame(1016, { simMs: 0.5, betweenMs: 5, drawMs: 3 });
    frame(1000 + OVERLAY_REFRESH_MS, { simMs: 0.5, betweenMs: 5, drawMs: 3 });
    const { stats } = latest();
    expect(stats.frames).toBe(2);
    expect(stats.steps).toBe(2);
    expect(stats.intervalMs.max).toBe(OVERLAY_REFRESH_MS - 16);
    expect(stats.simMs).toEqual({ median: 0.5, p95: 0.5, max: 0.5 });
    expect(stats.drawMs).toEqual({ median: 3, p95: 3, max: 3 });
  });

  it("refreshes the overlay once a second, not every frame", () => {
    const { frame, shown } = setUp();
    for (let ms = 0; ms < 3 * OVERLAY_REFRESH_MS; ms += 16) frame(ms, { simMs: 1, drawMs: 1 });
    expect(shown).toHaveLength(3);
  });

  it("gives the same numbers as text and as data", () => {
    const { frame, latest } = setUp();
    frame(0, { simMs: 1, drawMs: 2 });
    frame(20, { simMs: 1, drawMs: 2 });
    frame(OVERLAY_REFRESH_MS, { simMs: 1, drawMs: 2 });
    expect(latest().stats.intervalMs.median).toBe(20);
    expect(latest().text).toContain("50.0 kl./s");
  });

  it("counts no frame while the game is paused, nor the pause as an interval after it", () => {
    const { frame, latest } = setUp();
    frame(0, { simMs: 1, drawMs: 1 });
    frame(16, { simMs: 1, drawMs: 1 });
    frame(32, { simMs: 0, drawMs: 1 }, true);
    frame(5000, { simMs: 0, drawMs: 1 }, true);
    frame(5016, { simMs: 1, drawMs: 1 });
    frame(5016 + OVERLAY_REFRESH_MS, { simMs: 1, drawMs: 1 });
    expect(latest().stats.frames).toBe(3);
    expect(latest().stats.intervalMs.max).toBe(OVERLAY_REFRESH_MS);
  });

  it("leaves out the frame after the page was hidden", () => {
    const { diagnostics, frame, latest } = setUp();
    frame(0, { simMs: 1, drawMs: 1 });
    frame(16, { simMs: 1, drawMs: 1 });
    diagnostics.discardNext();
    frame(9000, { simMs: 1, drawMs: 1 });
    frame(9016, { simMs: 1, drawMs: 1 });
    frame(9016 + OVERLAY_REFRESH_MS, { simMs: 1, drawMs: 1 });
    expect(latest().stats.frames).toBe(3);
    expect(latest().stats.longFrames).toBe(1);
    expect(latest().stats.intervalMs.max).toBe(OVERLAY_REFRESH_MS);
  });
});
