import type { Page, TestInfo } from "@playwright/test";
import {
  builtInHill,
  button,
  closeJumpControls,
  jumpCanvas,
  openJumpControls,
  openJumpFromStart,
  press,
  TEXT,
} from "./support/app";
import { expect, test, type DeviceTraits } from "./support/fixtures";
import { boxOf, LAYOUT_SLACK_PX, type Box } from "./support/geometry";

type Positions = Record<string, Box>;

/** The picture and, on touch screens, the controls a player aims at during a jump. */
async function jumpPositions(page: Page, traits: DeviceTraits): Promise<Positions> {
  const picture = await boxOf(jumpCanvas(page));
  if (!traits.touch) return { picture };
  return {
    picture,
    left: await boxOf(button(page, TEXT.leftPad)),
    right: await boxOf(button(page, TEXT.rightPad)),
    pause: await boxOf(button(page, TEXT.pause)),
  };
}

/** The buttons under the picture on a desktop screen. */
async function toolbarPositions(page: Page): Promise<Positions> {
  return {
    again: await boxOf(button(page, TEXT.jumpAgain)),
    hills: await boxOf(button(page, TEXT.toHills)),
    sound: await boxOf(button(page, TEXT.sound)),
  };
}

async function menuPositions(page: Page): Promise<Positions> {
  return {
    title: await boxOf(page.getByRole("heading", { name: "Telemark" })),
    training: await boxOf(button(page, TEXT.training)),
    outfit: await boxOf(button(page, TEXT.outfit)),
  };
}

/** The largest move of any edge of any element between two measurements, in CSS pixels, with what moved. */
function largestShift(before: Positions, after: Positions): { px: number; what: string } {
  let worst = { px: 0, what: "nothing" };
  for (const [name, a] of Object.entries(before)) {
    const b = after[name];
    if (!b) continue;
    const px = Math.max(
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
      Math.abs(a.x + a.width - b.x - b.width),
      Math.abs(a.y + a.height - b.y - b.height),
    );
    if (px > worst.px) worst = { px, what: name };
  }
  return worst;
}

function report(testInfo: TestInfo, cause: string, shift: { px: number; what: string }): void {
  testInfo.annotations.push({
    type: "layout shift",
    description: `${cause}: ${shift.px.toFixed(2)} px (${shift.what})`,
  });
}

test("settings and the pause controls do not move the picture or the main controls", async ({
  page,
  traits,
}, testInfo) => {
  await openJumpFromStart(page, traits);
  const before = await jumpPositions(page, traits);

  await openJumpControls(page, traits);
  await press(button(page, TEXT.sound), traits);
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");
  await press(button(page, TEXT.scenery), traits);
  await expect(button(page, TEXT.scenery)).toHaveText("Sceneria: dzień");
  await closeJumpControls(page, traits);

  const shift = largestShift(before, await jumpPositions(page, traits));
  report(testInfo, "sound off, scenery changed, controls opened and closed", shift);
  expect(shift.px, `${shift.what} moved`).toBeLessThanOrEqual(LAYOUT_SLACK_PX);
});

test("the web font arriving late does not move the picture or the main controls", async ({
  page,
  traits,
}, testInfo) => {
  // The fonts are held back until the screens have been laid out with the fallback font.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\.woff2?$/, async (route) => {
    await held;
    await route.continue();
  });
  const fontsLoaded = () => page.evaluate(() => document.fonts.check('16px "Silkscreen"'));

  await page.goto("/");
  await expect(button(page, TEXT.training)).toBeVisible();
  expect(await fontsLoaded(), "the fallback font is in use").toBe(false);
  const menuBefore = await menuPositions(page);
  await press(button(page, TEXT.training), traits);
  await press(builtInHill(page), traits);
  await expect(jumpCanvas(page)).toBeVisible();
  const jumpBefore = await jumpPositions(page, traits);

  release();
  await expect.poll(fontsLoaded).toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const jumpShift = largestShift(jumpBefore, await jumpPositions(page, traits));
  report(testInfo, "web font on the jump screen", jumpShift);
  await openJumpControls(page, traits);
  await press(button(page, TEXT.toHills), traits);
  await press(button(page, TEXT.back), traits);
  const menuShift = largestShift(menuBefore, await menuPositions(page));
  report(testInfo, "web font on the menu", menuShift);

  expect(jumpShift.px, `${jumpShift.what} moved on the jump screen`).toBeLessThanOrEqual(LAYOUT_SLACK_PX);
  expect(menuShift.px, `${menuShift.what} moved on the menu`).toBeLessThanOrEqual(LAYOUT_SLACK_PX);
});

// Known defect, desktop layout (seen on desktop-chromium at 1280 by 720): the buttons under the picture are a
// centred row sized by their labels. When a label changes ("Dźwięk: wł." to "Dźwięk: wył.", the scenery name) the
// whole row re-centres and its buttons move sideways, by 8.75 px in this sequence; when the web font replaces the
// fallback font they move by 53 px. The picture itself stays in place (the tests above). A fix means giving the
// row columns that do not depend on the label text, which changes how the toolbar looks, so it is left to a
// deliberate change.
test.fixme("the buttons under the picture keep their place when a label changes", async ({ page, traits }) => {
  test.skip(!traits.desktop, "the row of buttons under the picture is the desktop layout");
  await openJumpFromStart(page, traits);
  const before = await toolbarPositions(page);
  await press(button(page, TEXT.sound), traits);
  await expect(button(page, TEXT.sound)).toHaveAttribute("aria-pressed", "false");
  await press(button(page, TEXT.scenery), traits);
  await expect(button(page, TEXT.scenery)).toHaveText("Sceneria: dzień");
  const shift = largestShift(before, await toolbarPositions(page));
  expect(shift.px, `${shift.what} moved`).toBeLessThanOrEqual(LAYOUT_SLACK_PX);
});
