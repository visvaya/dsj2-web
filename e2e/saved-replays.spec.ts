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
  const distance = landed?.distance ?? "";
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(`${distance} m`);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(/\d+,\d\sKB/);
  await expect(replayRows(page, "Zachowane")).toHaveCount(1);

  // The hill list offers the record's replay beside the hill.
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.training), traits);
  await press(button(page, "Powtórka rekordu: Ćwiczebna K90"), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  await openReplays(page, traits);

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
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 5");
  await press(recent, traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 10");
  const age = page.getByRole("checkbox", { name: "Usuwaj powtórki starsze niż (dni)" });
  await age.check();
  await expect(page.getByRole("spinbutton", { name: "Usuwaj powtórki starsze niż (dni)" })).toHaveValue("30");
  await openMenu(page);
  await press(button(page, TEXT.settings), traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 10");
  await expect(age).toBeChecked();
});

test("replays go out to a file and come back from it, each once", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);
  const landed = (await playUntilLanded(page, traits)).at(-1);
  expect(landed?.kind).toBe("landed");
  await openReplays(page, traits);
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  // The last jumps are kept from the start: the same jump is there a second time.
  await expect(replayRows(page, "Ostatnie skoki")).toHaveCount(1);

  // All selected, the button lets go of them all; then all again.
  await press(button(page, "Zaznacz wszystkie"), traits);
  await press(button(page, "Odznacz wszystkie"), traits);
  await expect(button(page, "Eksportuj zaznaczone (0)")).toBeVisible();
  await press(button(page, "Zaznacz wszystkie"), traits);
  const exported = page.waitForEvent("download");
  await press(button(page, "Eksportuj zaznaczone (2)"), traits);
  const download = await exported;
  expect(download.suggestedFilename()).toMatch(/^telemark-powtorki-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();

  // Read back beside the record, the jump is kept; a second time it is there already.
  const chooser = page.locator('input[type="file"]');
  await chooser.setInputFiles(path);
  await expect(page.getByRole("status")).toHaveText("Wczytano powtórek: 1; już zachowanych: 1.");
  await expect(replayRows(page, "Zachowane")).toHaveCount(1);
  await chooser.setInputFiles(path);
  await expect(page.getByRole("status")).toHaveText("Wczytano powtórek: 0; już zachowanych: 2.");

  // The selected ones go after a second press.
  await press(button(page, "Zaznacz wszystkie"), traits);
  const removeSelected = button(page, /^(Usuń zaznaczone|Na pewno usunąć) /);
  await press(removeSelected, traits);
  await expect(removeSelected).toHaveText("Na pewno usunąć 3?");
  await press(removeSelected, traits);
  await expect(page.getByText("Nie ma jeszcze zapisanych powtórek.")).toBeVisible();
});
