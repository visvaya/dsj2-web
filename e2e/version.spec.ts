import { readFileSync } from "node:fs";
import { openJumpControls, openJumpFromStart, openMenu } from "./support/app";
import { expect, test } from "./support/fixtures";

// The version of the game has one source, package.json: the game shows it, and release.json names it.
function versionIn(json: unknown): unknown {
  return typeof json === "object" && json !== null && "version" in json ? json.version : undefined;
}
const VERSION = versionIn(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));

test("the main menu and the menu of the jump name the version of package.json, as release.json does", async ({
  page,
  traits,
}) => {
  expect(typeof VERSION).toBe("string");
  const label = `wersja ${String(VERSION)}`;
  await openMenu(page);
  await expect(page.locator("header")).toContainText(label);
  const releaseJson: unknown = await page.evaluate(async () => {
    const response = await fetch("/release.json");
    return (await response.json()) as unknown;
  });
  expect(versionIn(releaseJson)).toBe(VERSION);

  await openJumpFromStart(page, traits);
  await openJumpControls(page, traits);
  await expect(page.locator(".game-toolbar")).toContainText(label);
});
