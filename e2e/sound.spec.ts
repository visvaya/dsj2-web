import type { Page } from "@playwright/test";
import { button, closeJumpControls, openJumpControls, openJumpFromStart, press, TEXT } from "./support/app";
import { AUDIBLE_LEVEL, audioState, installAudioProbe, SILENT_LEVEL } from "./support/audio-probe";
import { expect, test, type DeviceTraits } from "./support/fixtures";

/** Long enough for a fading gain to settle and for a sound that should not be there to show up. */
const SETTLE_MS = 600;

/**
 * The first gesture on the jump screen that does not start a jump: the right zone, or the key of the right
 * button (a mouse press would capture the pointer and keep it from the buttons used next).
 */
async function firstGesture(page: Page, traits: DeviceTraits): Promise<void> {
  if (traits.touch) await button(page, TEXT.rightPad).tap();
  else await page.keyboard.press("x");
}

const level = (page: Page) => async (): Promise<number> => (await audioState(page)).level;

test("sound starts with the first gesture and the sound switch silences it", async ({ page, traits, browserName }) => {
  test.skip(
    browserName === "firefox",
    "in the automated Firefox the audio context stays suspended after a synthesized press; sound is on the manual checklist",
  );
  await installAudioProbe(page);
  await openJumpFromStart(page, traits);

  // The clicks that led here were on other screens; on this one nothing has been touched yet.
  await page.waitForTimeout(SETTLE_MS);
  expect((await audioState(page)).running).toBe(0);

  await firstGesture(page, traits);
  await expect.poll(async () => (await audioState(page)).running).toBe(1);
  // At the gate the wind is heard.
  await expect.poll(level(page)).toBeGreaterThan(AUDIBLE_LEVEL);

  await openJumpControls(page, traits);
  await press(button(page, TEXT.sound), traits);
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");
  await closeJumpControls(page, traits);
  await expect.poll(level(page)).toBeLessThan(SILENT_LEVEL);

  // Switched back on, the wind returns: the silence above was the switch, not a dead context.
  await openJumpControls(page, traits);
  await press(button(page, TEXT.sound), traits);
  await closeJumpControls(page, traits);
  await expect.poll(level(page)).toBeGreaterThan(AUDIBLE_LEVEL);
});

test("with sound switched off in the saved settings a new visit stays silent", async ({ page, traits }) => {
  await installAudioProbe(page);
  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);
  await press(button(page, TEXT.sound), traits);
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");

  await openJumpFromStart(page, traits);
  await firstGesture(page, traits);
  // A context may run, but nothing reaches its output.
  await page.waitForTimeout(SETTLE_MS);
  const state = await audioState(page);
  expect(state.level).toBeLessThan(SILENT_LEVEL);
  expect(state.created).toBeLessThanOrEqual(1);
});
