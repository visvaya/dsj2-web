import type { Locator, Page } from "@playwright/test";
import { button, jumpCanvas, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { boxOf, LAYOUT_SLACK_PX, receivesPointer } from "./support/geometry";

/** The address that switches the diagnostics on (src/game/diagnostics.ts). */
const DIAGNOSTICS_ADDRESS = "/?diag";
/** Names of the User Timing marks (src/game/performance-marks.ts). */
const MARK_FIRST_SCREEN = "telemark:first-screen";
const MARK_FIRST_JUMP_FRAME = "telemark:first-jump-frame";
/** The overlay is rewritten once a second; a busy machine may need a few of those to have counted a frame. */
const STATS_TIMEOUT_MS = 20_000;

const overlay = (page: Page): Locator => page.locator(".jump-diagnostics");

/** When each mark of that name was put, in milliseconds since the page began to load. */
function markTimes(page: Page, name: string): Promise<number[]> {
  return page.evaluate((mark) => performance.getEntriesByName(mark, "mark").map((entry) => entry.startTime), name);
}

/** Every number in the value, however deep. */
function numbersIn(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(numbersIn);
}

/** The statistics the overlay carries for tests, or null before it was first written. */
async function shownStats(page: Page): Promise<Record<string, unknown> | null> {
  const json = await overlay(page).getAttribute("data-stats");
  if (json === null) return null;
  const stats: unknown = JSON.parse(json);
  if (typeof stats !== "object" || stats === null) throw new Error(`The statistics are not an object: ${json}`);
  return { ...stats };
}

test("without the switch there is no overlay, and the start of the game is marked on the timeline", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  await expect(overlay(page)).toHaveCount(0);

  await expect.poll(() => markTimes(page, MARK_FIRST_JUMP_FRAME)).toHaveLength(1);
  const [firstScreenMs] = await markTimes(page, MARK_FIRST_SCREEN);
  const [firstJumpFrameMs] = await markTimes(page, MARK_FIRST_JUMP_FRAME);
  expect(await markTimes(page, MARK_FIRST_SCREEN)).toHaveLength(1);
  expect(firstScreenMs).toBeGreaterThan(0);
  expect(firstJumpFrameMs).toBeGreaterThan(firstScreenMs ?? Number.POSITIVE_INFINITY);
});

test("with the switch the overlay shows measurements of the frames and stays out of the way", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  const plainPicture = await boxOf(jumpCanvas(page));

  await openJumpFromStart(page, traits, DIAGNOSTICS_ADDRESS);
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toHaveAttribute("aria-hidden", "true");

  await expect
    .poll(async () => (await shownStats(page))?.["frames"] ?? 0, { timeout: STATS_TIMEOUT_MS })
    .toBeGreaterThan(0);
  const stats = await shownStats(page);
  expect(Object.keys(stats ?? {}).toSorted()).toEqual([
    "cappedFrames",
    "drawMs",
    "droppedSteps",
    "frames",
    "intervalMs",
    "longFrames",
    "simMs",
    "steps",
  ]);
  const numbers = numbersIn(stats);
  // Five counters and three spreads of three numbers each.
  expect(numbers).toHaveLength(14);
  for (const number of numbers) {
    expect(Number.isFinite(number)).toBe(true);
    expect(number).toBeGreaterThanOrEqual(0);
  }
  await expect(overlay(page)).toHaveText(/kl\.\/s/);

  // The overlay takes no press meant for the game, and the picture is where it is without the overlay.
  expect(await receivesPointer(button(page, TEXT.pause))).toBe(true);
  expect(await receivesPointer(jumpCanvas(page))).toBe(true);
  expect(await overlay(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  const picture = await boxOf(jumpCanvas(page));
  for (const side of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(picture[side] - plainPicture[side]), `the ${side} of the picture`).toBeLessThanOrEqual(
      LAYOUT_SLACK_PX,
    );
  }
});
