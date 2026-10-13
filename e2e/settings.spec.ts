import { button, openJumpControls, openJumpFromStart, press, storedSave, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";

/** One desktop and one phone project: the save is the same code everywhere, the controls differ by pointer. */
const PROJECTS = ["desktop-chromium", "android-portrait"];
/** The scenery button steps through the choices; the first step from the default ("zmienna") is the day. */
const SCENERY_AFTER_ONE_STEP = "Sceneria: dzień";

test.skip(({ traits }) => !PROJECTS.includes(traits.project), `settings are checked on ${PROJECTS.join(" and ")}`);

test("sound and scenery chosen on the jump screen survive a reload", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);

  const sound = button(page, TEXT.sound);
  await expect(sound).toHaveText("Dźwięk: wł.");
  await press(sound, traits);
  await expect(sound).toHaveText("Dźwięk: wył.");
  await expect(sound).toHaveAttribute("aria-pressed", "false");

  const scenery = button(page, TEXT.scenery);
  await expect(scenery).toHaveText("Sceneria: zmienna");
  await press(scenery, traits);
  await expect(scenery).toHaveText(SCENERY_AFTER_ONE_STEP);

  await expect.poll(() => storedSave(page)).toMatchObject({ settings: { sound: false, scenery: "day" } });

  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.sound)).toHaveText("Dźwięk: wył.");
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");
  await expect(button(page, TEXT.scenery)).toHaveText(SCENERY_AFTER_ONE_STEP);
});
