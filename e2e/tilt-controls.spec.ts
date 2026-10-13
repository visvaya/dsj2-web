import type { Page } from "@playwright/test";
import { button, jumpCanvas, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { boxOf, LAYOUT_SLACK_PX, receivesPointer } from "./support/geometry";
import { startAnnouncedAt } from "./support/jump";

const TILT_OFF = "Pochylanie: palec";
const TILT_ON = "Pochylanie: przechył";
const LEFT_HALF = /^Lewa połowa ekranu/;
const RIGHT_HALF = /^Prawa połowa ekranu/;
/** The gate opens about a second after the jump screen appears; a tap before that is repeated. */
const START_TAP_WAIT_MS = 200;
const START_TAP_LIMIT = 60;

test.skip(({ traits }) => !traits.touch, "tilt steering exists only on touch screens");

const TILT_REFUSED = "Brak zgody na czujnik ruchu: pochylanie palcem.";

/** Asks for tilt steering from the pause menu; false where the browser has no motion sensor or refuses it. */
async function switchTiltOn(page: Page): Promise<boolean> {
  await button(page, TEXT.pause).tap();
  await button(page, TILT_OFF).tap();
  await expect(button(page, TILT_ON).or(page.getByText(TILT_REFUSED))).toBeVisible();
  const on = await button(page, TILT_ON).isVisible();
  await button(page, TEXT.resume).tap();
  await expect(button(page, TEXT.resume)).toBeHidden();
  return on;
}

test("with tilt steering the zones are gone and the two halves of the screen are the buttons", async ({
  page,
  traits,
  viewport,
}) => {
  await openJumpFromStart(page, traits);
  const screen = viewport ?? { width: 0, height: 0 };
  const pictureWithZones = await boxOf(jumpCanvas(page));
  await expect(button(page, TEXT.leftPad)).toBeVisible();

  const tiltOn = await switchTiltOn(page);
  test.skip(!tiltOn, "this browser has no motion sensor to switch on, or refuses it");
  await expect(button(page, TEXT.leftPad)).toHaveCount(0);
  const left = await boxOf(button(page, LEFT_HALF));
  const right = await boxOf(button(page, RIGHT_HALF));
  expect(left.x).toBeCloseTo(0, 0);
  expect(left.y).toBeCloseTo(0, 0);
  expect(left.width).toBeCloseTo(screen.width / 2, 0);
  expect(left.height).toBeCloseTo(screen.height, 0);
  expect(right.x).toBeCloseTo(screen.width / 2, 0);
  expect(right.width).toBeCloseTo(screen.width / 2, 0);
  expect(right.height).toBeCloseTo(screen.height, 0);

  // The picture has the room the zones had: wider beside them, never smaller.
  const picture = await boxOf(jumpCanvas(page));
  expect(picture.width).toBeGreaterThanOrEqual(pictureWithZones.width - LAYOUT_SLACK_PX);
  if (traits.landscape) expect(picture.width).toBeGreaterThan(pictureWithZones.width);

  // The pause button is above the halves and inside the screen.
  const pause = button(page, TEXT.pause);
  await expect(pause).toBeInViewport({ ratio: 1 });
  expect(await receivesPointer(pause)).toBe(true);

  // The first thumb is the left button whichever half it touches: a tap on the right half starts the jump.
  let started = false;
  for (let attempt = 0; attempt < START_TAP_LIMIT && !started; attempt++) {
    await page.touchscreen.tap(right.x + right.width / 2, right.y + right.height * 0.75);
    started = (await startAnnouncedAt(page, START_TAP_WAIT_MS)) !== null;
  }
  expect(started, "a tap on the right half of the screen starts the jump").toBe(true);
});
