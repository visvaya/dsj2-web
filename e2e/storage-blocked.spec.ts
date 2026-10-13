import { button, openJumpControls, openJumpFromStart, openMenu, press, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";

/** One desktop and one phone project: the storage is the same code everywhere. */
const PROJECTS = ["desktop-chromium", "android-portrait"];
const NOT_SAVED = "Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.";

test.skip(
  ({ traits }) => !PROJECTS.includes(traits.project),
  `blocked storage is checked on ${PROJECTS.join(" and ")}`,
);

// A browser that refuses the page its storage (blocked site data, some private windows): reading the storage
// objects themselves throws. The game has to say so and work for the visit; an error on the way, an unhandled
// rejection included, fails the test like any other page error.
test("with storage refused the game warns, and plays and keeps its settings for the visit", async ({
  page,
  traits,
}) => {
  await page.addInitScript(() => {
    const refuse = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", { get: refuse });
    Object.defineProperty(window, "indexedDB", { get: refuse });
  });

  await openMenu(page);
  await expect(page.getByText(NOT_SAVED)).toBeVisible();

  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);
  const sound = button(page, TEXT.sound);
  await expect(sound).toHaveText("Dźwięk: wł.");
  await press(sound, traits);
  await expect(sound).toHaveText("Dźwięk: wył.");
});
