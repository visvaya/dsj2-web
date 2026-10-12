import { button, fontsReady, jumpCanvas, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { boxOf, overlap, receivesPointer } from "./support/geometry";
import { expectTouchZonesPlaced, MIN_TOUCH_TARGET_PX } from "./support/touch-zones";

test.skip(({ traits }) => !traits.touch, "the touch zones and the pause button exist only for coarse pointers");

test("the touch zones are large, clear of the picture and placed for the orientation", async ({
  page,
  traits,
  viewport,
}) => {
  await openJumpFromStart(page, traits);
  await fontsReady(page);
  await expectTouchZonesPlaced(page, viewport ?? { width: 0, height: 0 });
});

test("the pause button can be reached and opens and closes the controls", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);
  const pause = button(page, TEXT.pause);
  await expect(pause).toBeVisible();
  await expect(pause).toBeInViewport({ ratio: 1 });
  const pauseBox = await boxOf(pause);
  expect(pauseBox.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(pauseBox.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(await receivesPointer(pause)).toBe(true);
  expect(overlap(pauseBox, await boxOf(jumpCanvas(page)))).toBe(false);
  await expect(pause).toHaveAttribute("aria-expanded", "false");

  await pause.tap();
  await expect(pause).toHaveAttribute("aria-expanded", "true");
  const resume = button(page, TEXT.resume);
  await expect(resume).toBeVisible();
  expect(await receivesPointer(resume)).toBe(true);
  await expect(button(page, TEXT.toHills)).toBeVisible();

  await resume.tap();
  await expect(resume).toBeHidden();
  await expect(pause).toHaveAttribute("aria-expanded", "false");
});
