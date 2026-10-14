/**
 * Limits of the measurements in this directory.
 *
 * Each limit comes from a measurement: 2026-10-13, a laptop with an Intel Core i7-6700HQ, Windows 11, Microsoft
 * Edge 155 without a window, a 1280 x 720 viewport, three runs of the whole set one after another; the three
 * values are given beside each limit (three more runs the same day agree with them). Timings and counts that
 * grow with the load are set to about three times the median of the three runs, because the machine that runs
 * them in CI is another one and is shared. Counters that were the same in every run are set to that value; the
 * reason is given at each.
 *
 * "Slowed" is the processor of the page made `CPU_SLOWDOWN_FACTOR` (4) times slower (e2e/support/perf.ts).
 */
export const PERF_BUDGET = {
  // One whole jump on the slowed processor. Measured: the game shows 20 frames a second there (a frame
  // interval of 49.9 to 50 ms in all three runs), because drawing alone takes 34.8 to 39.9 ms (median).

  /** Simulation steps the game did not make up for. Measured 34.8, 30.3, 21.6. */
  SLOWED_DROPPED_STEPS: 90,
  /** Frames more than 50 ms after the one before. Measured 107, 63, 51 (of 312, 358, 354 frames). */
  SLOWED_LONG_FRAMES: 190,
  /** Tasks over 50 ms from the start of the jump. Measured 114, 63, 51. */
  SLOWED_LONG_TASKS: 190,
  /** Measured 164, 191, 162 ms. */
  SLOWED_LONGEST_TASK_MS: 490,
  /** 95th percentile of the frame interval. Measured 83.3, 66.7, 66.7 ms. */
  SLOWED_FRAME_INTERVAL_P95_MS: 200,
  /** 95th percentile of the time of all simulation steps of a frame. Measured 5.2, 3.6, 3.9 ms. */
  SLOWED_SIM_P95_MS: 12,
  /** 95th percentile of the drawing time of a frame. Measured 61.1, 53.2, 50.6 ms. */
  SLOWED_DRAW_P95_MS: 160,

  // The same jump at full speed, 59.9 frames a second; three jumps, the measure is the middle one. The game
  // drops time only when a frame comes more than eight steps (114 ms) late. Until 2026-10-14 every jump had one
  // such candidate: a single task of 85 to 130 ms (once 187 ms) at the first press on the picture, where the
  // audio context was created. In ten jumps it stayed under 114 ms six times and went over it four times. The
  // context is now created when the jump screen opens; in three jumps after that change no task was over 50 ms
  // and the longest frame interval was 50 ms. The limits stay as they were: they allow one stall of the machine.

  /** Frames that dropped time. Measured 0 or 1 in each of ten jumps: that one frame, never a second one. */
  FULL_SPEED_CAPPED_FRAMES: 1,
  /**
   * Measured 0 (six jumps), 1.1, 1.8, 2.3 and 5.2: what that one frame drops. Three times the largest, which
   * is one frame a third of a second late.
   */
  FULL_SPEED_DROPPED_STEPS: 15,

  // Twenty cycles of a new jump, the main menu and the hill again, after three to warm up.

  /**
   * Measured 208 listeners before and after, in all three runs: every screen removes what it adds. One
   * listener left per cycle would show as 20, so nothing is allowed.
   */
  CYCLES_EVENT_LISTENER_GROWTH: 0,
  /** Measured 157 nodes before and after, in all three runs; as with the listeners. */
  CYCLES_NODE_GROWTH: 0,
  /**
   * Heap in use after a forced collection. Measured growth of 685, 634, 873 KiB over the twenty cycles, most of
   * it in the first ten (533, 536, 758 KiB), so it levels off; a leak of a jump's state per cycle would not.
   */
  CYCLES_HEAP_GROWTH_KIB: 2000,

  // Median of five tries each, on the slowed processor.

  /** Navigation to the first screen, nothing stored, on the "Slow 4G" network. Measured 2385, 2010, 1907 ms. */
  FIRST_VISIT_FIRST_SCREEN_MS: 6000,
  /** The same for a page the service worker answers, on a plain network. Measured 1497, 1467, 1365 ms. */
  REPEAT_VISIT_FIRST_SCREEN_MS: 4400,
  /**
   * From the press on a hill of the list to the first picture of the jump. Measured 319, 298, 288 ms; 459 ms
   * (one run, 2026-10-14) since the audio context is created when the jump screen opens, before its first frame.
   */
  HILL_TO_FIRST_JUMP_FRAME_MS: 900,
} as const;
