import type { Page, TestInfo } from "@playwright/test";
import { button, closeJumpControls, jumpCanvas, openJumpControls, openJumpFromStart, press, TEXT } from "./support/app";
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

// A web font that arrives after the first screen replaces the fallback font there and moves what was laid out in
// it: with the web fonts switched off and on again, the buttons of the menu move by 4 pixels and the buttons under
// the picture on a desktop screen by up to 57. So the fonts are inside the stylesheet and the first screen waits
// for them; this test holds that in place.
test("the first screen is already drawn in the web fonts, which are not fetched on their own", async ({
  page,
}, testInfo) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:")) return;
    if (request.resourceType() === "font" || /\.woff2?(?:\?|$)/.test(url)) fontRequests.push(url);
  });
  // Which of the web fonts text is drawn in, measured on the page itself: a text is as wide in a web font as in
  // the fallback only while that web font is missing. The font loading interface is not asked, because it tells
  // what has been loaded, not what the text on the screen is drawn in.
  const webFontsShown = () =>
    page.evaluate(() => {
      const widthOf = (text: string, family: string): number => {
        const probe = document.createElement("span");
        probe.textContent = text;
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:32px ${family}`;
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      const shown = (text: string, family: string): boolean =>
        widthOf(text, `"${family}", monospace`) !== widthOf(text, "monospace");
      return {
        silkscreen: shown("Telemark 0123456789", "Silkscreen"),
        polishLetters: shown("ąćęłńśźż", "Telemark Polish"),
      };
    });

  // Not the load event: the measurement is of the first screen, before anything else has had time to arrive.
  await page.goto("/", { waitUntil: "commit" });
  await expect(button(page, TEXT.training)).toBeVisible();
  expect(await webFontsShown(), "fonts of the first screen").toEqual({ silkscreen: true, polishLetters: true });
  const before = await menuPositions(page);

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const shift = largestShift(before, await menuPositions(page));
  report(testInfo, "fonts settled on the menu", shift);

  expect(shift.px, `${shift.what} moved on the menu`).toBeLessThanOrEqual(LAYOUT_SLACK_PX);
  expect(fontRequests, "fonts fetched as separate files").toEqual([]);
});
