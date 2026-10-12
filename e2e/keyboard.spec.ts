import { button, jumpCanvas, openMenu, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { expectVisibleFocus, tabThrough } from "./support/focus";

test.skip(({ traits }) => !traits.desktop, "keyboard operation is checked where there is a keyboard");

test("the menu and the hill list are operated with the keyboard alone", async ({ page }) => {
  await openMenu(page);
  expect(await tabThrough(page, 3)).toEqual([TEXT.training, TEXT.outfit, "Wczytaj pliki gry"]);

  // Back to the first button; Enter opens the hill list and the focus moves to its heading.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(button(page, TEXT.training)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe(TEXT.hillListTitle);

  const visited = await tabThrough(page, 2);
  expect(visited[0]).toContain(TEXT.builtInHill);
  expect(visited[1]).toBe(TEXT.back);

  // Space activates as well; back on the menu the focus is on its title, not lost to the body.
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Telemark" })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe("Telemark");
});

test("the outfit screen is operated with the keyboard alone", async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(button(page, TEXT.outfit)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: TEXT.outfitTitle })).toBeFocused();
  await expectVisibleFocus(page);

  // One tab stop per part of the outfit, on its chosen colour; the arrows change the colour.
  const trousers = page.getByRole("group", { name: "Spodnie" }).getByRole("radio");
  await page.keyboard.press("Tab");
  const chosen = await trousers.evaluateAll((radios) =>
    radios.findIndex((radio) => radio instanceof HTMLInputElement && radio.checked),
  );
  await expect(trousers.nth(chosen)).toBeFocused();
  await expectVisibleFocus(page);
  const count = await trousers.count();
  await page.keyboard.press("ArrowRight");
  await expect(trousers.nth((chosen + 1) % count)).toBeChecked();
  await expect(trousers.nth((chosen + 1) % count)).toBeFocused();
  await expectVisibleFocus(page);

  // The other four parts, then the button that leaves.
  const rest = await tabThrough(page, 5);
  expect(rest.at(-1)).toBe(TEXT.back);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Telemark" })).toBeFocused();
});

test("the jump screen is operated with the keyboard alone and Escape leaves it", async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  // The picture takes the focus: its label is the description of the controls.
  await expect(jumpCanvas(page)).toBeFocused();
  await expectVisibleFocus(page);

  const visited = await tabThrough(page, 4);
  expect(visited).toEqual([
    expect.stringMatching(TEXT.jumpAgain),
    expect.stringMatching(TEXT.toHills),
    expect.stringMatching(TEXT.scenery),
    expect.stringMatching(TEXT.sound),
  ]);

  const sound = button(page, TEXT.sound);
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await expect(sound).toBeFocused();
  await expectVisibleFocus(page);

  await page.keyboard.press("Shift+Tab");
  const scenery = button(page, TEXT.scenery);
  await expect(scenery).toBeFocused();
  const before = await scenery.textContent();
  await page.keyboard.press("Enter");
  await expect(scenery).not.toHaveText(before ?? "");
  await expect(scenery).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe(TEXT.hillListTitle);
});
