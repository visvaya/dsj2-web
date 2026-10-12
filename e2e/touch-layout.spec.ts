import { button, fontsReady, jumpCanvas, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { bottomOf, boxOf, LAYOUT_SLACK_PX, overlap, receivesPointer, rightOf } from "./support/geometry";

/** The smallest touch target the game allows itself (WCAG 2.5.5), in CSS pixels. */
const MIN_TOUCH_TARGET_PX = 44;

test.skip(({ traits }) => !traits.touch, "the touch zones and the pause button exist only for coarse pointers");

test("the touch zones are large, clear of the picture and placed for the orientation", async ({
  page,
  traits,
  viewport,
}) => {
  await openJumpFromStart(page, traits);
  await fontsReady(page);
  const left = button(page, TEXT.leftPad);
  const right = button(page, TEXT.rightPad);
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  const picture = await boxOf(jumpCanvas(page));
  const leftBox = await boxOf(left);
  const rightBox = await boxOf(right);
  for (const zone of [leftBox, rightBox]) {
    expect(zone.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(zone.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(overlap(zone, picture)).toBe(false);
    expect(zone.x).toBeGreaterThanOrEqual(-LAYOUT_SLACK_PX);
    expect(zone.y).toBeGreaterThanOrEqual(-LAYOUT_SLACK_PX);
    expect(rightOf(zone)).toBeLessThanOrEqual((viewport?.width ?? 0) + LAYOUT_SLACK_PX);
    expect(bottomOf(zone)).toBeLessThanOrEqual((viewport?.height ?? 0) + LAYOUT_SLACK_PX);
  }
  expect(overlap(leftBox, rightBox)).toBe(false);

  // Landscape puts one zone on each side of the picture, portrait puts both below it.
  const beside = rightOf(leftBox) <= picture.x + LAYOUT_SLACK_PX && rightBox.x >= rightOf(picture) - LAYOUT_SLACK_PX;
  const below = leftBox.y >= bottomOf(picture) - LAYOUT_SLACK_PX && rightBox.y >= bottomOf(picture) - LAYOUT_SLACK_PX;
  expect({ beside, below }).toEqual({ beside: traits.landscape, below: !traits.landscape });
  expect(leftBox.x).toBeLessThan(rightBox.x);
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
