import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startStaticServer, type StaticServer } from "../scripts/lib/static-server.mjs";
import { SINGLE_FILE_DIR, SINGLE_FILE_NAME } from "./releases/paths";
import { builtInHill, button, jumpCanvas, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { OFFLINE_NOTE } from "./support/pwa";

// The game packed into one page, for hosts that take a single file. It has to work with nothing else to
// fetch, also inside a frame, and must never register a service worker, even under a secure address.
test.skip(({ traits }) => !traits.desktop, "the single-file page is checked once per engine, on the desktop profiles");

const FRAME_PAGE = "frame.html";

// Started for the tests that run; a skipped test has none.
let server: StaticServer | undefined;

test.beforeEach(async () => {
  writeFileSync(
    join(SINGLE_FILE_DIR, FRAME_PAGE),
    `<!doctype html><html lang="pl"><title>Ramka</title><link rel="icon" href="data:,"><iframe title="Telemark" src="${SINGLE_FILE_NAME}" width="900" height="600"></iframe></html>`,
  );
  server = await startStaticServer({ root: SINGLE_FILE_DIR });
});

test.afterEach(async () => {
  await server?.close();
  server = undefined;
});

function running(): StaticServer {
  if (!server) throw new Error("The server of the test has not been started");
  return server;
}

const pageRequests = (): string[] => running().requests.map((request) => request.path);

test("the single-file page fetches nothing else, registers no worker and plays without a network", async ({ page }) => {
  await page.goto(`${running().origin}/${SINGLE_FILE_NAME}`);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  // The address counts as secure, as HTTPS does: that alone must not make the page register a worker.
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  const registrations = await page.evaluate(async () =>
    "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  );
  expect(registrations).toBe(0);
  for (const note of Object.values(OFFLINE_NOTE)) await expect(page.getByText(note)).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"], link[rel="apple-touch-icon"]')).toHaveCount(0);

  running().setOffline(true);
  await button(page, TEXT.training).click();
  await builtInHill(page).click();
  await expect(jumpCanvas(page)).toBeVisible();
  expect(pageRequests()).toEqual([`/${SINGLE_FILE_NAME}`]);
});

test("the single-file page works inside a frame", async ({ page }) => {
  await page.goto(`${running().origin}/${FRAME_PAGE}`);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await frame.getByRole("button", { name: TEXT.training }).click();
  await frame.getByRole("button", { name: new RegExp(TEXT.builtInHill) }).click();
  await expect(frame.getByRole("img", { name: /^Skok na skoczni/ })).toBeVisible();
  expect(pageRequests()).toEqual([`/${FRAME_PAGE}`, `/${SINGLE_FILE_NAME}`]);
});
