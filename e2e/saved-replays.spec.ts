import type { Page } from "@playwright/test";
import {
  TEXT,
  announcement,
  button,
  closeJumpControls,
  openJumpControls,
  openJumpFromStart,
  openMenu,
  press,
} from "./support/app";
import { expect, test, type DeviceTraits } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";

const replayRows = (page: Page, group: string) => page.getByRole("region", { name: group }).getByRole("listitem");

async function openReplays(page: Page, traits: DeviceTraits): Promise<void> {
  await openMenu(page);
  await press(button(page, TEXT.replays), traits);
  await expect(page.getByRole("heading", { name: TEXT.replays })).toBeVisible();
}

test("a record keeps its replay, a jump can be kept by hand, and both stay after a reload", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  const landed = (await playUntilLanded(page, traits)).at(-1);
  expect(landed?.kind).toBe("landed");

  // Kept by hand once; a second time it is the same jump.
  await openJumpControls(page, traits);
  await press(button(page, TEXT.keepLast), traits);
  await expect(page.getByText("Ostatni skok jest zachowany")).toBeVisible();
  await press(button(page, TEXT.keepLast), traits);
  await expect(page.getByText("Ten skok jest już zachowany.")).toBeVisible();
  await closeJumpControls(page, traits);

  // A reload reads the replays back from the browser's store.
  await openReplays(page, traits);
  const distance = landed?.distance?.replace(",", ".") ?? "";
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(`${distance} m`);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(/\d+\.\d KB/);
  await expect(replayRows(page, "Zachowane")).toHaveCount(1);

  // Watched from here, it plays to the same landing.
  await press(replayRows(page, "Zachowane").getByRole("button", { name: "Obejrzyj" }), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  await expect(announcement(page)).toContainText(`Lądowanie: ${landed?.distance ?? ""} metra`, { timeout: 30_000 });

  // Removed after a second press that confirms it.
  await openReplays(page, traits);
  const remove = replayRows(page, "Zachowane").getByRole("button", { name: /^(Usuń|Na pewno usunąć\?)$/ });
  await press(remove, traits);
  await expect(remove).toHaveText("Na pewno usunąć?");
  await press(remove, traits);
  await expect(page.getByRole("region", { name: "Zachowane" })).toHaveCount(0);
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
});

test("the settings keep the last jumps and switch the clean-up on", async ({ page, traits }) => {
  await openMenu(page);
  await press(button(page, TEXT.settings), traits);
  const recent = button(page, /^Zapisuj ostatnie skoki: /);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: wył.");
  await press(recent, traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 5");
  const age = page.getByRole("checkbox", { name: "Usuwaj powtórki starsze niż (dni)" });
  await age.check();
  await expect(page.getByRole("spinbutton", { name: "Usuwaj powtórki starsze niż (dni)" })).toHaveValue("30");
  await openMenu(page);
  await press(button(page, TEXT.settings), traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 5");
  await expect(age).toBeChecked();
});
