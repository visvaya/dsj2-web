import { button, onEveryScreen, openJumpControls, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { focusReport } from "./support/focus";
import { targetProblems } from "./support/layout-audit";

test("every control is a large enough target and nothing covers it", async ({ page, traits }) => {
  const checked: string[] = [];
  await onEveryScreen(page, traits, async (screen) => {
    expect(await targetProblems(page), `targets on "${screen}"`).toEqual([]);
    checked.push(screen);
  });
  expect(checked.length).toBe(traits.touch ? 5 : 4);
});

test.describe("the controls behind the pause button", () => {
  test.skip(({ traits }) => !traits.touch, "the pause button exists only for coarse pointers");

  // A tablet with a keyboard: the open controls cover the picture, the zones and the pause button, so the
  // focus must stay on the controls and never go to an element underneath them.
  test("keep the keyboard focus on top while they are open", async ({ page, traits }) => {
    await openJumpFromStart(page, traits);
    await openJumpControls(page, traits);
    const controls = await page.locator(".game-toolbar button").count();
    expect(controls).toBeGreaterThanOrEqual(4);

    const visited = new Set<string>();
    const hiddenBehind: string[] = [];
    for (let i = 0; i < controls + 4; i++) {
      await page.keyboard.press("Tab");
      const focus = await focusReport(page);
      if (focus.onBody) continue;
      visited.add(focus.name);
      if (!focus.unobscured) hiddenBehind.push(focus.name);
    }
    expect(hiddenBehind, "focused while covered by the controls").toEqual([]);
    expect(visited.size).toBe(controls);

    // Closing with the keyboard returns the focus to the pause button.
    await button(page, TEXT.resume).focus();
    await page.keyboard.press("Enter");
    await expect(button(page, TEXT.resume)).toBeHidden();
    await expect(button(page, TEXT.pause)).toBeFocused();
  });
});
