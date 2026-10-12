import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import type { TestRelease } from "../releases/paths";
import { TEXT } from "./app";
import { expect, test } from "./fixtures";

/** What the menu says about playing without a network (src/pwa/offline-text.ts). */
export const OFFLINE_NOTE = {
  ready: "Gotowe do gry bez internetu.",
  unavailable: "Gra bez internetu nie jest jeszcze gotowa.",
  updateWaiting: "Nowa wersja jest gotowa. Zamknij wszystkie okna gry i uruchom ją ponownie.",
} as const;

const SAVE_KEY = "telemark.save";
/** A cache that is not the game's: an update or a rollback must leave it alone. */
const FOREIGN_CACHE = "someone-elses-cache";
const FOREIGN_KEY = "someone-elses-key";
/** Where the game keeps the player's files (src/storage/game-files-store.ts), and a record of the test's own. */
const FILES_DB = "telemark";
const FILES_STORE = "files";
const FILES_TEST_KEY = "test-record";
const REOPEN_LIMIT = 15;
const REOPEN_WAIT_MS = 200;

/**
 * A save as the game writes it, with a record on the built-in hill and settings that differ from the defaults.
 * The tests of updates plant it and compare it afterwards, character for character.
 */
const PLANTED_SAVE = JSON.stringify({
  schemaVersion: 2,
  records: { "own-1": { distanceM: 87.5, points: 101.5, dateIso: "2026-01-01T12:00:00.000Z" } },
  settings: { leanControl: "drag", vibration: false, scenery: "night", sound: false },
});

/** Opens the game at a server of the test's own and waits for the menu. */
export async function openGame(page: Page, origin: string, query = ""): Promise<void> {
  await page.goto(`${origin}/${query}`);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
}

/** Skips the test where the browser has no service workers at all; the skip names the reason in the report. */
export async function requireServiceWorkers(page: Page): Promise<void> {
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  test.skip(!supported, "this browser build has no service workers");
}

/** Whether a service worker answers for the page. The first page of a first visit is never taken over. */
export const controlled = (page: Page): Promise<boolean> =>
  page.evaluate(() => navigator.serviceWorker.controller !== null);

/** The commit of the release the page gets its files from: the worker's when one answers, else the server's. */
export function sourceShaSeenBy(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/release.json", { cache: "no-store" });
    const release: unknown = await response.json();
    const sourceSha: unknown = typeof release === "object" && release !== null ? Reflect.get(release, "sourceSha") : "";
    return typeof sourceSha === "string" ? sourceSha : "";
  });
}

/** The HTTP status the page gets for a path, or null when the request fails altogether. */
export function statusSeenBy(page: Page, path: string): Promise<number | null> {
  return page.evaluate(
    (target) =>
      fetch(target).then(
        (response) => response.status,
        () => null,
      ),
    path,
  );
}

export interface WorkerStates {
  installing: boolean;
  waiting: boolean;
  active: boolean;
}

export function workerStates(page: Page): Promise<WorkerStates> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      installing: Boolean(registration?.installing),
      waiting: Boolean(registration?.waiting),
      active: Boolean(registration?.active),
    };
  });
}

/**
 * Makes the browser look for a new release and waits for what becomes of it: "installed" when it is stored
 * and waiting, "redundant" when it could not be stored, "none" when the server has nothing new.
 */
export function checkForUpdate(page: Page): Promise<"installed" | "redundant" | "none"> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error("The page has no service worker registration");
    await registration.update();
    // A new worker, if the server had one, is being installed by now.
    const worker = registration.installing;
    if (worker === null) return "none";
    return new Promise<"installed" | "redundant">((resolve) => {
      const settle = () => {
        if (worker.state === "installed" || worker.state === "redundant") resolve(worker.state);
      };
      worker.addEventListener("statechange", settle);
      settle();
    });
  });
}

export const cacheNames = (page: Page): Promise<string[]> =>
  page.evaluate(async () => (await caches.keys()).toSorted());

/** Puts a save, a record in the game's database and a cache of another owner into the page's storage. */
export async function plantPlayerData(page: Page): Promise<void> {
  await page.evaluate(
    async ({ saveKey, save, cacheName, cacheKey, dbName, storeName, recordKey }) => {
      localStorage.setItem(saveKey, save);
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey, new Response("kept"));
      await new Promise<void>((resolve, reject) => {
        // The game has opened its database by now, so opening it here does not create it without its store.
        const open = indexedDB.open(dbName);
        open.addEventListener("error", () => reject(new Error("The database of the game files did not open")));
        open.addEventListener("success", () => {
          const db = open.result;
          const write = db.transaction(storeName, "readwrite").objectStore(storeName).put("kept", recordKey);
          write.addEventListener("error", () => reject(new Error("The record could not be written")));
          write.addEventListener("success", () => {
            db.close();
            resolve();
          });
        });
      });
    },
    {
      saveKey: SAVE_KEY,
      save: PLANTED_SAVE,
      cacheName: FOREIGN_CACHE,
      cacheKey: FOREIGN_KEY,
      dbName: FILES_DB,
      storeName: FILES_STORE,
      recordKey: FILES_TEST_KEY,
    },
  );
}

export interface PlayerData {
  /** The save exactly as stored. */
  save: string | null;
  /** The test's record in the database of the game files. */
  filesRecord: unknown;
  /** Content of the cache that is not the game's. */
  foreignCache: string | null;
}

export function playerData(page: Page): Promise<PlayerData> {
  return page.evaluate(
    async ({ saveKey, cacheName, cacheKey, dbName, storeName, recordKey }) => {
      const kept = (await caches.has(cacheName)) ? await (await caches.open(cacheName)).match(cacheKey) : undefined;
      const filesRecord = await new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.addEventListener("error", () => reject(new Error("The database of the game files did not open")));
        open.addEventListener("success", () => {
          const db = open.result;
          const read = db.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
          read.addEventListener("error", () => reject(new Error("The record could not be read")));
          read.addEventListener("success", () => {
            const record: unknown = read.result;
            db.close();
            resolve(record);
          });
        });
      });
      return {
        save: localStorage.getItem(saveKey),
        filesRecord,
        foreignCache: kept ? await kept.text() : null,
      };
    },
    {
      saveKey: SAVE_KEY,
      cacheName: FOREIGN_CACHE,
      cacheKey: FOREIGN_KEY,
      dbName: FILES_DB,
      storeName: FILES_STORE,
      recordKey: FILES_TEST_KEY,
    },
  );
}

/** What `playerData` returns after `plantPlayerData`, as long as nothing has touched the player's storage. */
export const PLANTED_DATA: PlayerData = { save: PLANTED_SAVE, filesRecord: "kept", foreignCache: "kept" };

/**
 * Launches the game again, as a player does after closing every window of it, until the given release answers.
 * A waiting worker takes over once no window is left; the browser does that a moment after the last one
 * closes, so a launch that still gets the old release is closed and repeated.
 */
export async function relaunchUntil(context: BrowserContext, origin: string, sourceSha: string): Promise<Page> {
  for (let attempt = 0; attempt < REOPEN_LIMIT; attempt++) {
    const page = await context.newPage();
    await openGame(page, origin);
    if ((await controlled(page)) && (await sourceShaSeenBy(page)) === sourceSha) return page;
    await page.close();
    await new Promise((resolve) => {
      setTimeout(resolve, REOPEN_WAIT_MS);
    });
  }
  throw new Error(`The release ${sourceSha} did not take over after ${REOPEN_LIMIT} launches`);
}

/** Path of the script the release's page loads, for example "/assets/index-abc.js". */
export function scriptPathOf(release: TestRelease): string {
  const page = readFileSync(join(release.dir, "index.html"), "utf8");
  const path = /src="(\/assets\/[^"]+\.js)"/.exec(page)?.[1];
  if (path === undefined) throw new Error("The page of the release names no script");
  return path;
}
