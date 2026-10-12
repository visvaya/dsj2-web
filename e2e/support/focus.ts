import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

interface FocusReport {
  /** Accessible text of the focused element, for the failure message. */
  name: string;
  /** The focus fell back to the page body (or left the document). */
  onBody: boolean;
  /** The middle of the element is inside the viewport. */
  inViewport: boolean;
  /** Nothing else lies on top of the middle of the element. */
  unobscured: boolean;
  /** The element looks different with the focus than without it. */
  indicator: boolean;
}

/**
 * Describes the element that has the keyboard focus. A file input and the radio buttons of the outfit screen are
 * visually hidden inside their label, which carries the focus ring, so for them the label is measured.
 */
export function focusReport(page: Page): Promise<FocusReport> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) {
      return { name: "", onBody: true, inViewport: false, unobscured: false, indicator: false };
    }
    const shown = active.closest("label") ?? active;
    const look = (): string => {
      const style = getComputedStyle(shown);
      return [
        style.outlineStyle,
        style.outlineWidth,
        style.outlineColor,
        style.borderTopColor,
        style.borderTopWidth,
        style.boxShadow,
      ].join(" ");
    };
    const rect = shown.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const focused = look();
    active.blur();
    const blurred = look();
    active.focus();
    return {
      name: (active.getAttribute("aria-label") ?? shown.textContent).trim(),
      onBody: false,
      inViewport: rect.width > 0 && rect.height > 0 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
      unobscured: hit !== null && shown.contains(hit),
      indicator: focused !== blurred,
    };
  });
}

/** The focus is on a visible, unobscured element with a visible focus indicator; returns that element's name. */
export async function expectVisibleFocus(page: Page): Promise<string> {
  const report = await focusReport(page);
  expect(report, `focus on "${report.name}"`).toMatchObject({
    onBody: false,
    inViewport: true,
    unobscured: true,
    indicator: true,
  });
  return report.name;
}

/** Presses Tab `count` times and returns the names of the elements the focus visited, each checked on the way. */
export async function tabThrough(page: Page, count: number): Promise<string[]> {
  const visited: string[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    visited.push(await expectVisibleFocus(page));
  }
  return visited;
}
