import type { Page } from "@playwright/test";
import { builtInHill, openHillList, openMenu } from "./support/app";
import { expect, test } from "./support/fixtures";

// No file of the original game is available to the tests, so only the refusals are covered.

const NOT_A_GAME_FILE = "Wśród wybranych plików nie ma Dsj.exe.";
const UNREADABLE_GAME_FILE =
  "Nie udało się odczytać plików: to nie są pliki gry Deluxe Ski Jump 2 w wersji 2.10P albo są uszkodzone.";

/** What the game keeps of the player's files in IndexedDB: the names of the stored parts. */
function storedGameFiles(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        // The game has opened the database by now, so opening it here does not create it without its store.
        const open = indexedDB.open("telemark");
        open.addEventListener("error", () => reject(new Error("The database of the game files did not open")));
        open.addEventListener("success", () => {
          const db = open.result;
          const read = db.transaction("files", "readonly").objectStore("files").get("game");
          read.addEventListener("error", () => reject(new Error("The stored game files could not be read")));
          read.addEventListener("success", () => {
            const record: unknown = read.result;
            db.close();
            const parts = typeof record === "object" && record !== null ? Object.keys(record) : [];
            resolve(parts.filter((part) => part === "exe" || part === "dat"));
          });
        });
      }),
  );
}

async function expectRefusal(page: Page, message: string): Promise<void> {
  const status = page.getByRole("status");
  await expect(status).toHaveText(message);
  await expect(status).toHaveClass(/error/);
  expect(await storedGameFiles(page)).toEqual([]);
  await expect(page.getByText(/zapamiętane w tej przeglądarce/)).toHaveCount(0);
}

const CASES = [
  {
    name: "a file that is not the game",
    file: { name: "notatki.txt", mimeType: "text/plain", text: "To nie jest gra." },
    message: NOT_A_GAME_FILE,
  },
  {
    name: "a file named like the game with other content",
    file: { name: "Dsj.exe", mimeType: "application/octet-stream", text: "To nie jest program DOS-a." },
    message: UNREADABLE_GAME_FILE,
  },
];

for (const { name, file, message } of CASES) {
  test(`${name} is refused in Polish and nothing is stored`, async ({ page, traits }) => {
    await openMenu(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.text, "utf8") });
    await expectRefusal(page, message);

    // Nothing comes back when the page is loaded again, and the built-in hill is still there to jump on.
    await openMenu(page);
    expect(await storedGameFiles(page)).toEqual([]);
    await expect(page.getByText(/Skocznie z oryginału: \d/)).toHaveCount(0);
    await openHillList(page, traits);
    await expect(builtInHill(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Skocznie z oryginału" })).toHaveCount(0);
  });
}
