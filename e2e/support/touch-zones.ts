import type { Page } from "@playwright/test";
import { button, jumpCanvas, TEXT } from "./app";
import { expect } from "./fixtures";
import { bottomOf, boxOf, LAYOUT_SLACK_PX, overlap, rightOf } from "./geometry";

/** The smallest touch target the game allows itself (WCAG 2.5.5), in CSS pixels. */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * The L and P zones are on screen, large enough, clear of the picture and of each other, and placed for the
 * orientation: one on each side of the picture in landscape, both below it in portrait.
 */
export async function expectTouchZonesPlaced(page: Page, screen: { width: number; height: number }): Promise<void> {
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
    expect(rightOf(zone)).toBeLessThanOrEqual(screen.width + LAYOUT_SLACK_PX);
    expect(bottomOf(zone)).toBeLessThanOrEqual(screen.height + LAYOUT_SLACK_PX);
  }
  expect(overlap(leftBox, rightBox)).toBe(false);
  expect(leftBox.x).toBeLessThan(rightBox.x);

  const beside = rightOf(leftBox) <= picture.x + LAYOUT_SLACK_PX && rightBox.x >= rightOf(picture) - LAYOUT_SLACK_PX;
  const below = leftBox.y >= bottomOf(picture) - LAYOUT_SLACK_PX && rightBox.y >= bottomOf(picture) - LAYOUT_SLACK_PX;
  const landscape = screen.width > screen.height;
  expect({ beside, below }).toEqual({ beside: landscape, below: !landscape });
}
