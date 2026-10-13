import { createFrameMeter, type FrameStats } from "../game/frame-meter";
import { diagnosticsLines } from "./jump-diagnostics-text";

/** How often the overlay is rewritten. */
export const OVERLAY_REFRESH_MS = 1000;

/** Writes the overlay: its text, and the statistics the text was made from. */
type ShowDiagnostics = (text: string, stats: FrameStats) => void;

export interface JumpDiagnostics {
  /** Called right before and right after the simulation steps of a frame, and right before its drawing. */
  stepsBegin(): void;
  stepsEnd(): void;
  drawBegin(): void;
  /**
   * Called once the picture of the frame is on the canvas, with the time the browser gave the frame. A frame
   * of a paused game is not counted, and neither is the first one, which has no frame before it.
   */
  frameEnd(frameMs: number, plan: { steps: number; droppedS: number }, paused: boolean): void;
  /** Leaves out the next frame: the one after the page was hidden comes late for no fault of the game. */
  discardNext(): void;
}

/**
 * Measures the frames of the jump loop and shows the result about once a second. The loop creates it only when
 * the diagnostics are asked for, so a normal game reads no clock for it.
 */
export function createJumpDiagnostics(
  show: ShowDiagnostics,
  clock: () => number = () => performance.now(),
): JumpDiagnostics {
  const meter = createFrameMeter();
  let lastFrameMs: number | null = null;
  let stepsBeganMs = 0;
  let stepsEndedMs = 0;
  let drawBeganMs = 0;
  let shownAtMs = Number.NEGATIVE_INFINITY;

  return {
    stepsBegin() {
      stepsBeganMs = clock();
    },
    stepsEnd() {
      stepsEndedMs = clock();
    },
    drawBegin() {
      drawBeganMs = clock();
    },
    frameEnd(frameMs, plan, paused) {
      const drawEndedMs = clock();
      const previousMs = lastFrameMs;
      lastFrameMs = frameMs;
      if (previousMs !== null && !paused) {
        meter.record({
          intervalMs: frameMs - previousMs,
          simMs: stepsEndedMs - stepsBeganMs,
          drawMs: drawEndedMs - drawBeganMs,
          steps: plan.steps,
          droppedS: plan.droppedS,
        });
      }
      if (frameMs - shownAtMs < OVERLAY_REFRESH_MS) return;
      shownAtMs = frameMs;
      const stats = meter.stats();
      show(diagnosticsLines(stats).join("\n"), stats);
    },
    discardNext() {
      meter.discardNext();
    },
  };
}
