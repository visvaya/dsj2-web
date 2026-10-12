import type { Locator, Page } from "@playwright/test";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout is compared with half a CSS pixel of slack: boxes are fractional on dense screens. */
export const LAYOUT_SLACK_PX = 0.5;

export async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) throw new Error("The element has no box: it is not rendered");
  return box;
}

export const rightOf = (box: Box): number => box.x + box.width;
export const bottomOf = (box: Box): number => box.y + box.height;

export function overlap(a: Box, b: Box): boolean {
  return (
    a.x < rightOf(b) - LAYOUT_SLACK_PX &&
    b.x < rightOf(a) - LAYOUT_SLACK_PX &&
    a.y < bottomOf(b) - LAYOUT_SLACK_PX &&
    b.y < bottomOf(a) - LAYOUT_SLACK_PX
  );
}

/** Whether the point in the middle of the element belongs to it, that is, nothing else lies on top there. */
export function receivesPointer(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  });
}

export interface ScrollState {
  overflowXPx: number;
  overflowYPx: number;
  /** Where the page ended up after being asked to scroll by 50 pixels each way. */
  scrolledXPx: number;
  scrolledYPx: number;
}

export function scrollState(page: Page): Promise<ScrollState> {
  return page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(50, 50);
    const state = {
      overflowXPx: root.scrollWidth - root.clientWidth,
      overflowYPx: root.scrollHeight - root.clientHeight,
      scrolledXPx: window.scrollX,
      scrolledYPx: window.scrollY,
    };
    window.scrollTo(0, 0);
    return state;
  });
}
