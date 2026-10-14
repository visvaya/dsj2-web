import { TEXT, button, openMenu, press } from "./support/app";
import { expect, test } from "./support/fixtures";

// No file of the original game is available to the tests: playing a replay of the original is covered by
// src/ui/original-replay-choice.test.ts, and here only the screen and its refusals.

/** The size of a replay of the original: 13 bytes of header, the 1205-byte record and its checksum. */
const REPLAY_FILE_BYTES = 1222;

test("the replay screen explains what it needs and refuses a file that is not a sound replay", async ({
  page,
  traits,
}) => {
  await openMenu(page);
  await press(button(page, TEXT.replays), traits);
  await expect(page.getByRole("heading", { name: TEXT.replays })).toBeFocused();
  await expect(page).toHaveTitle("Powtórki · Telemark");
  // Without the player's Dsj.exe there are no hills of the original to play a replay on.
  await expect(page.getByText(/najpierw wczytaj pliki gry/)).toBeVisible();

  const choose = (name: string, buffer: Buffer) =>
    page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/octet-stream", buffer });
  const status = page.getByRole("status");

  await choose("notatki.txt", Buffer.from("To nie jest powtórka.", "utf8"));
  await expect(status).toHaveText("To nie jest plik powtórki DSJ2 (.rpl).");
  await expect(status).toHaveClass(/error/);

  // The right size, but not what the original writes: the checksum gives it away.
  await choose("KARPACZ.RPL", Buffer.alloc(REPLAY_FILE_BYTES));
  await expect(status).toHaveText("Plik powtórki jest uszkodzony: suma kontrolna się nie zgadza.");

  await press(button(page, TEXT.back), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
});
