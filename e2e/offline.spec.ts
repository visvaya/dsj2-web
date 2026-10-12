import { startStaticServer, type StaticServer } from "../scripts/lib/static-server.mjs";
import { RELEASE_A, RELEASE_B } from "./releases/paths";
import { BUILT_IN_HILL_ID, builtInHill, leaveJumpForHills, openHillList, openJump, storedSave } from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";
import {
  cacheNames,
  checkForUpdate,
  controlled,
  OFFLINE_NOTE,
  openGame,
  PLANTED_DATA,
  plantPlayerData,
  playerData,
  relaunchUntil,
  requireServiceWorkers,
  scriptPathOf,
  sourceShaSeenBy,
  statusSeenBy,
  workerStates,
} from "./support/pwa";

// Playing without a network, updates and rollbacks. Every test has a server of its own, so it can take the
// network away or put another release under the same address without touching the other tests. A browser
// context is one profile: closing a page and opening another in it is closing the game and launching it again.
//
// The service worker is the same code on every device profile of an engine, so the desktop profiles of the
// three engines cover it.
test.skip(({ traits }) => !traits.desktop, "the service worker is checked once per engine, on the desktop profiles");

// Started for the tests that run; a skipped test has none.
let started: StaticServer | undefined;

test.beforeEach(async () => {
  started = await startStaticServer({ root: RELEASE_A.dir });
});

test.afterEach(async () => {
  await started?.close();
  started = undefined;
});

function testServer(): StaticServer {
  if (!started) throw new Error("The server of the test has not been started");
  return started;
}

const GAME_CACHE = /^telemark-shell-[0-9a-f]{16}$/;
const gameCaches = (names: readonly string[]): string[] => names.filter((name) => GAME_CACHE.test(name));

test("after one visit the game starts and is played without a network", async ({ page, context, traits }) => {
  const server = testServer();
  // A whole jump in real time, perhaps repeated after a fall, on top of two launches of the game.
  test.slow();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  // The page that was open during the first install is not taken over: it keeps the files it started with.
  expect(await controlled(page)).toBe(false);
  await page.close();

  server.setOffline(true);
  const launched = await context.newPage();
  // A query string, as a launch from the home screen may add: the browser's own cache has no such address.
  await openGame(launched, server.origin, "?source=homescreen");
  expect(await controlled(launched)).toBe(true);
  expect(await sourceShaSeenBy(launched)).toBe(RELEASE_A.sourceSha);
  await expect(launched.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  for (const path of ["/manifest.webmanifest", "/icons/icon-192.png", "/licenses/silkscreen-ofl.txt"]) {
    expect(await statusSeenBy(launched, path), path).toBe(200);
  }

  await openHillList(launched, traits);
  await openJump(launched, traits);
  const outcomes = await playUntilLanded(launched, traits);
  expect(outcomes.at(-1)?.kind).toBe("landed");
  await leaveJumpForHills(launched, traits);
  await expect(builtInHill(launched)).toContainText("rekord");

  await launched.reload();
  await expect(launched.getByRole("heading", { name: "Główne menu" })).toBeVisible();
  await openHillList(launched, traits);
  await expect(builtInHill(launched)).toContainText("rekord");
  expect(await storedSave(launched)).toMatchObject({
    records: { [BUILT_IN_HILL_ID]: { distanceM: expect.any(Number) } },
  });
});

test("a first visit without a network gets no game", async ({ page }) => {
  const server = testServer();
  server.setOffline(true);
  await expect(page.goto(`${server.origin}/`)).rejects.toThrow();
  expect(server.requests).toEqual([]);
});

test.describe("when the worker cannot be fetched", () => {
  // Each engine words the refusal to register a worker whose script is not there in its own way.
  test.use({ expectedProblems: /bad HTTP response code \(404\)|Failed to load resource.*404|sw\.js/ });

  test("the game works online, says so, and the browser's own cache does not make it start offline", async ({
    page,
    context,
  }) => {
    const server = testServer();
    server.setFaults([{ path: "/sw.js", kind: "missing" }]);
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.unavailable)).toBeVisible();
    expect(await workerStates(page)).toEqual({ installing: false, waiting: false, active: false });
    await page.close();

    // Every file of the game has been fetched once and sits in the browser's cache; without the worker that
    // is not enough to start.
    server.setOffline(true);
    const launched = await context.newPage();
    await expect(launched.goto(`${server.origin}/`)).rejects.toThrow();
  });
});

test("a new release waits until every window is closed, then takes over and keeps the player's data", async ({
  page,
  context,
}) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();

  const first = await relaunchUntil(context, server.origin, RELEASE_A.sourceSha);
  await plantPlayerData(first);
  const second = await context.newPage();
  await openGame(second, server.origin);
  // Set on the page itself: gone if anything reloads it.
  await first.evaluate(() => {
    document.documentElement.dataset["untouched"] = "yes";
  });

  server.setRoot(RELEASE_B.dir);
  expect(await checkForUpdate(first)).toBe("installed");
  for (const window of [first, second]) {
    await expect(window.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
    expect(await sourceShaSeenBy(window)).toBe(RELEASE_A.sourceSha);
  }
  expect(await first.evaluate(() => document.documentElement.dataset["untouched"])).toBe("yes");
  expect(await workerStates(first)).toEqual({ installing: false, waiting: true, active: true });
  expect(gameCaches(await cacheNames(first))).toHaveLength(2);

  // One window closed, the other still open in the background: the old release goes on, also for a new window.
  await first.close();
  const third = await context.newPage();
  await openGame(third, server.origin);
  expect(await sourceShaSeenBy(third)).toBe(RELEASE_A.sourceSha);
  await expect(third.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  expect(await workerStates(third)).toEqual({ installing: false, waiting: true, active: true });

  await second.close();
  await third.close();
  const updated = await relaunchUntil(context, server.origin, RELEASE_B.sourceSha);
  await expect(updated.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await expect(updated.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
  expect(await updated.evaluate(() => document.querySelector("script[src]")?.getAttribute("src"))).toBe(
    scriptPathOf(RELEASE_B),
  );
  expect(gameCaches(await cacheNames(updated))).toHaveLength(1);
  expect(await playerData(updated)).toEqual(PLANTED_DATA);
});

test("a release that cannot be stored whole leaves the running one as it was", async ({ page, context }) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const running = await relaunchUntil(context, server.origin, RELEASE_A.sourceSha);
  const cachesBefore = await cacheNames(running);

  server.setRoot(RELEASE_B.dir);
  for (const kind of ["missing", "corrupt"] as const) {
    server.setFaults([{ path: scriptPathOf(RELEASE_B), kind }]);
    expect(await checkForUpdate(running), `a ${kind} script`).toBe("redundant");
    expect(await workerStates(running)).toEqual({ installing: false, waiting: false, active: true });
    expect(await cacheNames(running), "no part of the failed release is kept").toEqual(cachesBefore);
    await expect(running.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
    await expect(running.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  }

  // The running release still starts without a network.
  server.setOffline(true);
  await running.reload();
  await expect(running.getByRole("heading", { name: "Główne menu" })).toBeVisible();
  expect(await sourceShaSeenBy(running)).toBe(RELEASE_A.sourceSha);
  server.setOffline(false);

  // The next attempt, with the server whole, stores the release.
  server.setFaults([]);
  expect(await checkForUpdate(running)).toBe("installed");
  await expect(running.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
});

test("a release replaced on the server while it is being stored leaves no part of it", async ({ page, context }) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const running = await relaunchUntil(context, server.origin, RELEASE_A.sourceSha);
  const cachesBefore = await cacheNames(running);

  // The worker of release B arrives; then, at the request for B's script, the server is back on release A,
  // which has no such file.
  server.setRoot(RELEASE_B.dir);
  server.onRequest((request) => {
    if (request.path === scriptPathOf(RELEASE_B)) server.setRoot(RELEASE_A.dir);
  });
  expect(await checkForUpdate(running)).toBe("redundant");
  server.onRequest(null);
  expect(await cacheNames(running)).toEqual(cachesBefore);
  expect(await sourceShaSeenBy(running)).toBe(RELEASE_A.sourceSha);

  // The server settles on release B; the next check stores it.
  server.setRoot(RELEASE_B.dir);
  expect(await checkForUpdate(running)).toBe("installed");
});

test("going back to the earlier release reaches a player who has the newer one, and keeps the data", async ({
  page,
  context,
  browser,
}) => {
  const server = testServer();
  server.setRoot(RELEASE_B.dir);
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const newer = await relaunchUntil(context, server.origin, RELEASE_B.sourceSha);
  await plantPlayerData(newer);

  // The host serves release A again. For the player's browser that is one more update.
  server.setRoot(RELEASE_A.dir);
  expect(await checkForUpdate(newer)).toBe("installed");
  await expect(newer.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  expect(await sourceShaSeenBy(newer)).toBe(RELEASE_B.sourceSha);
  await newer.close();

  const back = await relaunchUntil(context, server.origin, RELEASE_A.sourceSha);
  await expect(back.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  expect(await back.evaluate(() => document.querySelector("script[src]")?.getAttribute("src"))).toBe(
    scriptPathOf(RELEASE_A),
  );
  expect(gameCaches(await cacheNames(back))).toHaveLength(1);
  expect(await playerData(back)).toEqual(PLANTED_DATA);

  // A player who comes for the first time gets release A too.
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    await openGame(fresh, server.origin);
    expect(await sourceShaSeenBy(fresh)).toBe(RELEASE_A.sourceSha);
  } finally {
    await freshContext.close();
  }
});

test.describe("when a script of the game cannot be fetched on a first visit", () => {
  // Each engine words the failure of a module script in its own way.
  test.use({ expectedProblems: /Failed to load resource|Loading (?:failed for the )?module|MIME type/ });

  // What a deployment can do to a visitor: the page comes from one release and, a moment later, its script
  // is asked of the next one, which does not have it.
  test("the page says so with a way to load it again, and does not reload itself", async ({ page }) => {
    const server = testServer();
    server.onRequest((request) => {
      if (request.path === scriptPathOf(RELEASE_A)) server.setRoot(RELEASE_B.dir);
    });
    await page.goto(`${server.origin}/`);
    const note = page.getByText(/Telemark: wczytywanie gry\./);
    await expect(note).toBeVisible();
    const again = page.getByRole("link", { name: "wczytaj stronę ponownie" });
    await expect(again).toBeVisible();
    // The note appears after a moment; by then a page that reloaded itself would have asked for itself again.
    expect(server.requests.filter((request) => request.path === "/")).toHaveLength(1);

    await again.click();
    await expect(page.getByRole("heading", { name: "Główne menu" })).toBeVisible();
    await expect(note).toHaveCount(0);
    expect(await sourceShaSeenBy(page)).toBe(RELEASE_B.sourceSha);
  });
});
