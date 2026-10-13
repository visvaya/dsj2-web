import { button, openJumpControls, openJumpFromStart, press, storedSave, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";

/** One desktop and one phone project: the save is the same code everywhere, the controls differ by pointer. */
const PROJECTS = ["desktop-chromium", "android-portrait"];
/** The scenery button steps through the choices; the first step from the default ("zmienna") is the day. */
const SCENERY_AFTER_ONE_STEP = "Sceneria: dzień";

test.skip(({ traits }) => !PROJECTS.includes(traits.project), `settings are checked on ${PROJECTS.join(" and ")}`);

test("sound, scenery and sensitivity chosen on the jump screen survive a reload", async ({ page, traits }) => {
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

  // The sensitivity is kept per way of steering: the mouse on a desktop, a dragged finger on a phone.
  const sensitivity = page.getByRole("group", { name: "Czułość sterowania" });
  await expect(sensitivity).toContainText("Czułość: 5");
  await press(button(page, "Większa czułość"), traits);
  await expect(sensitivity).toContainText("Czułość: 6");
  const levels = traits.desktop ? { mouse: 6, drag: 5, tilt: 5 } : { mouse: 5, drag: 6, tilt: 5 };

  await expect
    .poll(() => storedSave(page))
    .toMatchObject({ settings: { sound: false, scenery: "day", sensitivity: levels } });

  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.sound)).toHaveText("Dźwięk: wył.");
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");
  await expect(button(page, TEXT.scenery)).toHaveText(SCENERY_AFTER_ONE_STEP);
  await expect(page.getByRole("group", { name: "Czułość sterowania" })).toContainText("Czułość: 6");
});
