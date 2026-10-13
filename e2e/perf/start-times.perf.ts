import type { Page } from "@playwright/test";
import { builtInHill, openHillList, press, TEXT } from "../support/app";
import { expect, test } from "../support/fixtures";
import { medianOf, reportMeasurement } from "../support/measurement-log";
import {
  CPU_SLOWDOWN_FACTOR,
  MARK_FIRST_JUMP_FRAME,
  MARK_FIRST_SCREEN,
  markTime,
  protocolSession,
  SLOW_4G,
  slowNetwork,
  slowProcessor,
} from "../support/perf";
import { controlled, OFFLINE_NOTE } from "../support/pwa";
import { PERF_BUDGET } from "./perf-budget";

// How long a player waits: for the first screen on a first visit and on a later one, and for the first picture
// of a jump after choosing a hill. All on a slowed processor; the first visit also on a slow network.

const TRIALS = 5;
const MARK_TIMEOUT_MS = 60_000;
/** Put by the test at the press on the hill, so the time is counted on the page's clock alone. */
const MARK_HILL_PRESSED = "test:hill-pressed";
const TEST_TIMEOUT_MS = 240_000;

async function slowed(page: Page, network: boolean): Promise<void> {
  const session = await protocolSession(page);
  await slowProcessor(session, CPU_SLOWDOWN_FACTOR);
  if (network) await slowNetwork(session, SLOW_4G);
}

test("the first screen of a first visit comes within its budget on a slow processor and network", async ({
  browser,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const trialsMs: number[] = [];
  for (let trial = 0; trial < TRIALS; trial++) {
    // A profile of its own each time: nothing stored, no service worker.
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await slowed(page, true);
      await page.goto("/");
      trialsMs.push(await markTime(page, MARK_FIRST_SCREEN, MARK_TIMEOUT_MS));
      expect(await controlled(page)).toBe(false);
    } finally {
      await context.close();
    }
  }
  const medianMs = medianOf(trialsMs);
  await reportMeasurement(testInfo, "first-visit-first-screen", {
    cpuSlowdown: CPU_SLOWDOWN_FACTOR,
    network: SLOW_4G,
    trialsMs,
    medianMs,
  });
  expect(medianMs, "median time to the first screen").toBeLessThanOrEqual(PERF_BUDGET.FIRST_VISIT_FIRST_SCREEN_MS);
});

test("a later visit and the first picture of a jump come within their budgets on a slow processor", async ({
  page,
  context,
  traits,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await page.goto("/");
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();

  const firstScreenMs: number[] = [];
  const firstJumpFrameMs: number[] = [];
  for (let trial = 0; trial < TRIALS; trial++) {
    const launched = await context.newPage();
    await slowed(launched, false);
    await launched.goto("/");
    firstScreenMs.push(await markTime(launched, MARK_FIRST_SCREEN, MARK_TIMEOUT_MS));
    expect(await controlled(launched)).toBe(true);

    await expect(launched.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
    await openHillList(launched, traits);
    await launched.evaluate((mark) => {
      addEventListener("click", () => performance.mark(mark), { capture: true, once: true });
    }, MARK_HILL_PRESSED);
    await press(builtInHill(launched), traits);
    const shownMs = await markTime(launched, MARK_FIRST_JUMP_FRAME, MARK_TIMEOUT_MS);
    firstJumpFrameMs.push(shownMs - (await markTime(launched, MARK_HILL_PRESSED, MARK_TIMEOUT_MS)));
    await launched.close();
  }

  const firstScreenMedianMs = medianOf(firstScreenMs);
  const firstJumpFrameMedianMs = medianOf(firstJumpFrameMs);
  await reportMeasurement(testInfo, "repeat-visit-first-screen", {
    cpuSlowdown: CPU_SLOWDOWN_FACTOR,
    trialsMs: firstScreenMs,
    medianMs: firstScreenMedianMs,
  });
  await reportMeasurement(testInfo, "hill-to-first-jump-frame", {
    cpuSlowdown: CPU_SLOWDOWN_FACTOR,
    trialsMs: firstJumpFrameMs,
    medianMs: firstJumpFrameMedianMs,
  });
  expect(firstScreenMedianMs, "median time to the first screen of a later visit").toBeLessThanOrEqual(
    PERF_BUDGET.REPEAT_VISIT_FIRST_SCREEN_MS,
  );
  expect(firstJumpFrameMedianMs, "median time from the hill to the first picture of the jump").toBeLessThanOrEqual(
    PERF_BUDGET.HILL_TO_FIRST_JUMP_FRAME_MS,
  );
});
