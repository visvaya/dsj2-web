import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdbRecord } from "../storage/idb-record";
import { withRecord, type Shelf } from "../storage/replay-shelf";
import { entry, record } from "../storage/test-support/shelf-entries";
import { recordReplayStore, replayStoreWithFallback, type ReplayStore } from "../storage/replay-store";
import { emptySave, withJump, type SaveData } from "../storage/save-data";
import { memoryBackend, saveSave } from "../storage/save-store";
import { saveSync } from "./save-sync";
import { SHELF_SYNC, shelfSync } from "./shelf-sync";

/** A record of IndexedDB in memory, shared by the windows of one test. */
function storedRecord(): IdbRecord {
  let value: unknown;
  return {
    get: () => Promise.resolve(value),
    put: (next) => {
      value = next;
      return Promise.resolve();
    },
    update: (change) => {
      value = change(value);
      return Promise.resolve(value);
    },
    delete: () => Promise.resolve(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
const ids = (shelf: Shelf) => shelf.map((e) => e.id);

/** One window of the game as the hook drives it: React's state, the effect that shows the shelf, its writes. */
function aWindow(store: ReplayStore, clean: (shelf: Shelf) => Shelf = (shelf) => shelf) {
  let state: Shelf = [];
  let writes = 0;
  const counted: ReplayStore = {
    get name() {
      return store.name;
    },
    load: () => store.load(),
    save: (shelf, journal) => {
      writes += 1;
      return store.save(shelf, journal);
    },
  };
  const sync = shelfSync(counted, {
    setShelf: (update) => {
      state = update(state);
      queueMicrotask(() => sync.shown(state));
    },
    setStoreName: () => undefined,
    clean,
  });
  return {
    sync,
    state: () => state,
    writes: () => writes,
    change: (next: (current: Shelf) => Shelf) => {
      const before = state;
      state = next(state);
      sync.changed(before, state);
      sync.shown(state);
    },
  };
}

describe("a window's shelf kept in step with the store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not write back and forth when both windows hold a record replay that lost", async () => {
    const record$ = storedRecord();
    const first = aWindow(replayStoreWithFallback(recordReplayStore(record$)));
    const second = aWindow(replayStoreWithFallback(recordReplayStore(record$)));
    const stops = [first.sync.connect(), second.sync.connect()];
    first.change((s) => withRecord(s, record("long", 214)));
    await settle();
    // Each window then takes a shorter jump for a record (its save is older); the merge keeps the longer one.
    second.change((s) => withRecord(s, record("shorter", 200)));
    await settle();
    first.change((s) => withRecord(s, record("shortest", 190)));
    await settle();
    expect(ids(first.state())).toEqual(["long"]);
    expect(ids(second.state())).toEqual(["long"]);

    const before = first.writes() + second.writes();
    const elsewhere = new BroadcastChannel("telemark-replays");
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
    elsewhere.postMessage("written");
    await settle();
    await settle();
    expect(first.writes() + second.writes() - before).toBe(0);
    elsewhere.close();
    for (const stop of stops) stop();
  });

  it("tries a failed first read again after a while", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const store: ReplayStore = {
      name: "indexedDB",
      load: () => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error("blocked")) : Promise.resolve([entry("a")]);
      },
      save: (shelf) => Promise.resolve({ shelf, durable: true }),
    };
    const window = aWindow(store);
    window.sync.readLater();
    await vi.advanceTimersByTimeAsync(SHELF_SYNC.READ_RETRY_MS);
    expect(ids(window.state())).toEqual([]);
    await vi.advanceTimersByTimeAsync(SHELF_SYNC.READ_RETRY_MS);
    expect(ids(window.state())).toEqual(["a"]);
  });

  it("cleans up a shelf taken from the store as the settings ask", async () => {
    const store: ReplayStore = {
      name: "indexedDB",
      load: () => Promise.resolve([entry("kept"), entry("recent", { kind: "recent" })]),
      save: (shelf) => Promise.resolve({ shelf, durable: true }),
    };
    const window = aWindow(store, (shelf) => shelf.filter((e) => e.kind !== "recent"));
    window.sync.refresh();
    await settle();
    expect(ids(window.state())).toEqual(["kept"]);
  });
});

describe("a window's save kept in step with the other windows", () => {
  it("takes the record another window stored, when that window says it wrote", async () => {
    const backend = memoryBackend();
    let here: SaveData = emptySave();
    const listening = saveSync(backend, (update) => {
      here = update(here);
    });
    const writing = saveSync(backend, () => undefined);
    const stops = [listening.connect(), writing.connect()];
    await saveSave(backend, withJump(emptySave(), "own-1", { distanceM: 90, points: 80, fell: false }, new Date()));
    writing.written();
    await settle();
    expect(here.records["own-1"]?.distanceM).toBe(90);
    for (const stop of stops) stop();
  });
});
