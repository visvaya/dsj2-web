import { onEveryScreen } from "./support/app";
import { expect, test } from "./support/fixtures";

const TITLES: Readonly<Record<string, string>> = {
  menu: "Telemark",
  outfit: "Strój · Telemark",
  "hill list": "Wybór skoczni · Telemark",
  jump: "Skok: Ćwiczebna K90 · Telemark",
  // Opening the controls of the jump screen does not change where the player is.
  "jump with the controls open": "Skok: Ćwiczebna K90 · Telemark",
};
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test("each screen has its own title and the page background is set on the root element", async ({ page, traits }) => {
  const titles = new Map<string, string>();
  await onEveryScreen(page, traits, async (screen) => {
    await expect(page, `title of "${screen}"`).toHaveTitle(TITLES[screen] ?? "");
    titles.set(screen, await page.title());

    // The background painted beside the picture in landscape and behind an overscroll is the root's: it must
    // be a real colour and the same one the page content sits on, or a band of another colour shows.
    const colours = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colours.root, `root background on "${screen}"`).not.toBe(TRANSPARENT);
    expect(colours.root).toBe(colours.body);
  });
  expect(new Set([titles.get("menu"), titles.get("outfit"), titles.get("hill list"), titles.get("jump")]).size).toBe(4);
});
