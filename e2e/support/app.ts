import type { Locator, Page } from "@playwright/test";
import { expect, type DeviceTraits } from "./fixtures";

/** Text of the interface the tests look for, as the screens write it. */
export const TEXT = {
  menuHeading: "Główne menu",
  training: "Trening",
  outfit: "Strój",
  back: "Wstecz",
  hillListTitle: "Wybierz skocznię do treningu",
  outfitTitle: "Edycja kolorów stroju",
  builtInHill: "Ćwiczebna",
  pause: "Pauza i ustawienia",
  resume: "Wróć do gry",
  jumpAgain: /^Jeszcze raz/,
  toHills: /^Skocznie/,
  scenery: /^Sceneria: /,
  sound: /^Dźwięk: /,
  leftPad: /^Lewy przycisk/,
  rightPad: "Prawy przycisk",
} as const;

/** Key of the save in localStorage and the id of the only hill available without the player's files. */
const SAVE_KEY = "telemark.save";
export const BUILT_IN_HILL_ID = "own-1";

export const jumpCanvas = (page: Page): Locator => page.getByRole("img", { name: /^Skok na skoczni/ });
export const announcement = (page: Page): Locator => page.locator("p[aria-live]");
export const builtInHill = (page: Page): Locator => page.getByRole("button", { name: new RegExp(TEXT.builtInHill) });
export const button = (page: Page, name: RegExp | string): Locator => page.getByRole("button", { name });

/** Activates a control the way the device does: a tap on a touch screen, a click elsewhere. */
export async function press(target: Locator, traits: DeviceTraits): Promise<void> {
  await (traits.touch ? target.tap() : target.click());
}

/** Geometry is measured only after the web fonts are in, or the text boxes still have fallback metrics. */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function openMenu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await fontsReady(page);
}

export async function openHillList(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.training), traits);
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeVisible();
}

export async function openOutfit(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.outfit), traits);
  await expect(page.getByRole("heading", { name: TEXT.outfitTitle })).toBeVisible();
}

/** From the hill list to the jump screen of the built-in hill. */
export async function openJump(page: Page, traits: DeviceTraits): Promise<void> {
  await press(builtInHill(page), traits);
  await expect(jumpCanvas(page)).toBeVisible();
}

/** From a fresh page straight to the jump screen. */
export async function openJumpFromStart(page: Page, traits: DeviceTraits): Promise<void> {
  await openMenu(page);
  await openHillList(page, traits);
  await openJump(page, traits);
}

/** On touch screens the buttons of the jump screen sit behind the pause button. */
export async function openJumpControls(page: Page, traits: DeviceTraits): Promise<void> {
  if (!traits.touch) return;
  await button(page, TEXT.pause).tap();
  await expect(button(page, TEXT.resume)).toBeVisible();
}

export async function closeJumpControls(page: Page, traits: DeviceTraits): Promise<void> {
  if (!traits.touch) return;
  await button(page, TEXT.resume).tap();
  await expect(button(page, TEXT.resume)).toBeHidden();
}

export async function leaveJumpForHills(page: Page, traits: DeviceTraits): Promise<void> {
  await openJumpControls(page, traits);
  await press(button(page, TEXT.toHills), traits);
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeVisible();
}

/** The save as stored, or null before the first write. */
export async function storedSave(page: Page): Promise<unknown> {
  const json = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  return json === null ? null : (JSON.parse(json) as unknown);
}
