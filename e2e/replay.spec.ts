import {
  TEXT,
  announcement,
  button,
  closeJumpControls,
  jumpCanvas,
  openJumpControls,
  openJumpFromStart,
  press,
  storedSave,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";

/** A replay at full tempo reaches the touchdown a few seconds after it starts; a slow machine gets more. */
const TOUCHDOWN_TIMEOUT_MS = 30_000;
/** Long enough for an unpaused replay to have moved past its start. */
const PAUSE_HOLD_MS = 2500;

test("the last jump plays again to the same landing, pauses on a press of the picture and leaves for a new jump", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  // Nothing to watch before a jump has ended.
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.watchReplay)).toBeDisabled();
  await closeJumpControls(page, traits);

  const landed = (await playUntilLanded(page, traits)).at(-1);
  expect(landed?.kind).toBe("landed");
  const saved = await storedSave(page);

  await openJumpControls(page, traits);
  await press(button(page, TEXT.watchReplay), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);

  // Paused at once: the replay stays before the gate as long as it is held.
  await press(jumpCanvas(page), traits);
  await page.waitForTimeout(PAUSE_HOLD_MS);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  await press(jumpCanvas(page), traits);

  await expect(announcement(page)).toContainText(`Lądowanie: ${landed?.distance ?? ""} metra`, {
    timeout: TOUCHDOWN_TIMEOUT_MS,
  });
  // A replay is not a jump: the record stays as the jump left it.
  expect(await storedSave(page)).toEqual(saved);

  await openJumpControls(page, traits);
  await expect(button(page, TEXT.jumpAgain)).toBeHidden();
  await press(button(page, TEXT.replaySpeed), traits);
  await expect(button(page, TEXT.replaySpeed)).toHaveText("Tempo: 1/2");
  await press(button(page, TEXT.replayEnd), traits);
  await expect(announcement(page)).toHaveText("");
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.jumpAgain)).toBeVisible();
  await expect(button(page, TEXT.watchReplay)).toBeEnabled();
});
