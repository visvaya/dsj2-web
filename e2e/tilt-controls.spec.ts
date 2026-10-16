import type { Page } from "@playwright/test";
import { button, jumpCanvas, openJumpFromStart, storedSave, TEXT } from "./support/app";
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
const NO_READINGS = "Telefon nie podaje przechyłu: tym razem pochylanie palcem.";
const QUESTION = /^Pochylać skoczka, przechylając telefon\?/;
const TURN_PHONE = "Obróć telefon poziomo: więcej miejsca na skok.";

/** Switches the steering from the pause menu, from `from` to the other way. */
async function switchSteering(page: Page, from: string): Promise<void> {
  await button(page, TEXT.pause).tap();
  await button(page, from).tap();
  await expect(button(page, from === TILT_ON ? TILT_OFF : TILT_ON)).toBeVisible();
  await button(page, TEXT.resume).tap();
  await expect(button(page, TEXT.resume)).toBeHidden();
}

/** Waits until the saved settings lean with the finger. */
async function expectFingerSaved(page: Page): Promise<void> {
  await expect.poll(() => storedSave(page)).toMatchObject({ settings: { leanControl: "drag" } });
}

test.describe("with a motion sensor", () => {
  test.use({ motionSensor: "steady" });

  test("tilt steering is the default: the zones are gone and the two halves of the screen are the buttons", async ({
    page,
    traits,
    viewport,
  }) => {
    await openJumpFromStart(page, traits);
    const screen = viewport ?? { width: 0, height: 0 };
    await expect(button(page, TEXT.leftPad)).toHaveCount(0);
    await expect(button(page, LEFT_HALF)).toBeVisible();
    const left = await boxOf(button(page, LEFT_HALF));
    const right = await boxOf(button(page, RIGHT_HALF));
    expect(left.x).toBeCloseTo(0, 0);
    expect(left.y).toBeCloseTo(0, 0);
    expect(left.width).toBeCloseTo(screen.width / 2, 0);
    expect(left.height).toBeCloseTo(screen.height, 0);
    expect(right.x).toBeCloseTo(screen.width / 2, 0);
    expect(right.width).toBeCloseTo(screen.width / 2, 0);
    expect(right.height).toBeCloseTo(screen.height, 0);

    // The picture has the room the zones take: wider beside them, never smaller.
    const picture = await boxOf(jumpCanvas(page));
    await switchSteering(page, TILT_ON);
    await expect(button(page, TEXT.leftPad)).toBeVisible();
    const pictureWithZones = await boxOf(jumpCanvas(page));
    expect(picture.width).toBeGreaterThanOrEqual(pictureWithZones.width - LAYOUT_SLACK_PX);
    if (traits.landscape) expect(picture.width).toBeGreaterThan(pictureWithZones.width);
    await expectFingerSaved(page);
    await switchSteering(page, TILT_OFF);
    await expect(button(page, TEXT.leftPad)).toHaveCount(0);

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
});

test.describe("with a sensor that gives no readings", () => {
  test.use({ motionSensor: "silent" });

  test("the finger takes over for the visit after a moment and says why; tilting stays the choice", async ({
    page,
    traits,
  }) => {
    await openJumpFromStart(page, traits);
    await expect(page.getByRole("status").filter({ hasText: NO_READINGS })).toBeVisible();
    await expect(button(page, TEXT.leftPad)).toBeVisible();
    expect(JSON.stringify((await storedSave(page)) ?? {})).not.toContain('"leanControl":"drag"');
  });
});

test.describe("with a browser that asks first", () => {
  test.use({ motionSensor: "asks-grant" });

  test("the jump waits for the answer, and yes switches tilting on", async ({ page, traits }) => {
    await openJumpFromStart(page, traits);
    await expect(page.getByText(QUESTION)).toBeVisible();
    await button(page, "Tak, przechylaniem").tap();
    await expect(page.getByText(QUESTION)).toBeHidden();
    await expect(button(page, LEFT_HALF)).toBeVisible();
    await expect(button(page, TEXT.leftPad)).toHaveCount(0);
  });

  test("no keeps the finger, and the game does not ask again", async ({ page, traits }) => {
    await openJumpFromStart(page, traits);
    await button(page, "Nie, palcem").tap();
    await expect(button(page, TEXT.leftPad)).toBeVisible();
    await expectFingerSaved(page);
    // A new visit: the game starts at its menu, and the jump screen no longer asks.
    await openJumpFromStart(page, traits);
    await expect(button(page, TEXT.leftPad)).toBeVisible();
    await expect(page.getByText(QUESTION)).toHaveCount(0);
  });
});

test.describe("with a browser that asks and is refused", () => {
  test.use({ motionSensor: "asks-deny" });

  test("a refusal keeps the finger and says so", async ({ page, traits }) => {
    await openJumpFromStart(page, traits);
    await button(page, "Tak, przechylaniem").tap();
    await expect(page.getByRole("status").filter({ hasText: TILT_REFUSED })).toBeVisible();
    await expect(button(page, TEXT.leftPad)).toBeVisible();
    await expectFingerSaved(page);
  });
});

test("held upright, the jump screen suggests turning the phone, and plays on", async ({ page, traits }) => {
  test.skip(traits.landscape, "the suggestion is for a phone held upright");
  await openJumpFromStart(page, traits);
  await expect(page.getByRole("status").filter({ hasText: TURN_PHONE })).toBeVisible();
  await expect(button(page, TEXT.leftPad)).toBeVisible();
});
