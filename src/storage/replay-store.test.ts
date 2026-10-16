import { describe, expect, it } from "vitest";
import { encodeInputs } from "./input-codec";
import { ENGINE_REVISION, type Shelf, type ShelfEntry } from "./replay-shelf";
import type { IdbRecord } from "./idb-record";
import {
  REPLAY_STORE,
  detectReplayStore,
  memoryReplayStore,
  recordReplayStore,
  replayStoreWithFallback,
  type ReplayStore,
} from "./replay-store";
import { EMPTY_JOURNAL, journalAfter, journalAfterWrite, type ShelfJournal } from "./shelf-merge";

const copy = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** A stored record in memory, as IndexedDB would keep it; `failNext` makes the next writes fail. */
function storedRecord(initial: unknown): IdbRecord & { value: () => unknown; failNext: (count: number) => void } {
  let value = initial;
  let failing = 0;
  const failed = () => {
    if (failing === 0) return false;
    failing -= 1;
    return true;
  };
  return {
    get: () => Promise.resolve(copy(value)),
    put: (next) => {
      if (failed()) return Promise.reject(new Error("QuotaExceededError"));
      value = copy(next);
      return Promise.resolve();
    },
    update: (change) => {
      if (failed()) return Promise.reject(new Error("QuotaExceededError"));
      try {
        value = copy(change(copy(value)));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error("update failed"));
      }
      return Promise.resolve(copy(value));
    },
    delete: () => {
      value = undefined;
      return Promise.resolve();
    },
    value: () => value,
    failNext: (count) => {
      failing = count;
    },
  };
}

function entry(id: string, over: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    id,
    kind: "kept",
    hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 },
    dateIso: "2026-10-14T12:00:00.000Z",
    result: { distanceM: 88.5, points: 101.5, fell: false },
    newRecord: false,
    engineRevision: ENGINE_REVISION,
    replay: { kind: "own", seed: 42, inputs: encodeInputs([{ left: true, right: false, dy: 3 }]) },
    ...over,
  };
}

const shelf: Shelf = [entry("a")];
const ids = (s: Shelf) => s.map((e) => e.id);

/** One window: its store, its shelf and what it changed, as the hook of the game keeps them. */
function aWindow(record: IdbRecord) {
  const store = replayStoreWithFallback(recordReplayStore(record));
  let mine: Shelf = [];
  let journal: ShelfJournal = EMPTY_JOURNAL;
  return {
    store,
    load: async () => {
      mine = await store.load();
      return mine;
    },
    change: async (next: (current: Shelf) => Shelf) => {
      const after = next(mine);
      journal = journalAfter(journal, mine, after);
      const saved = await store.save(after, journal);
      if (saved.durable) journal = journalAfterWrite(journal, saved.shelf);
      mine = saved.shelf;
      return mine;
    },
  };
}

describe("replay store", () => {
  it("round-trips the shelf", async () => {
    const store = memoryReplayStore();
    expect(await store.load()).toEqual([]);
    await store.save(shelf, journalAfter(EMPTY_JOURNAL, [], shelf));
    expect(await store.load()).toEqual(shelf);
  });

  it("keeps a replay stored after one write failed: the next write tries the browser store again", async () => {
    const record = storedRecord(undefined);
    const window = aWindow(record);
    await window.load();
    record.failNext(1);
    await window.change((s) => [...s, entry("a")]);
    await window.change((s) => [...s, entry("record", { kind: "record" })]);
    expect(window.store.name).toBe("indexedDB");
    // A reload reads both: the one whose write failed and the one after it.
    expect(ids(await aWindow(record).load())).toEqual(["a", "record"]);
  });

  it("says the replays are kept for this visit only after repeated failures, and recovers", async () => {
    const failing: ReplayStore = {
      name: "indexedDB",
      load: () => Promise.reject(new Error("blocked")),
      save: () => Promise.reject(new Error("blocked")),
    };
    const store = replayStoreWithFallback(failing);
    const journal = journalAfter(EMPTY_JOURNAL, [], shelf);
    expect(REPLAY_STORE.FAILURES_BEFORE_NOTICE).toBe(2);
    const first = await store.save(shelf, journal);
    expect(first).toEqual({ shelf, durable: false });
    expect(store.name).toBe("indexedDB");
    await store.save(shelf, journal);
    expect(store.name).toBe("memory");
    expect(await store.load()).toEqual(shelf);

    const record = storedRecord(undefined);
    const recovering = replayStoreWithFallback(recordReplayStore(record));
    record.failNext(REPLAY_STORE.FAILURES_BEFORE_NOTICE);
    await recovering.save(shelf, journal);
    await recovering.save(shelf, journal);
    expect(recovering.name).toBe("memory");
    expect((await recovering.save(shelf, journal)).durable).toBe(true);
    expect(recovering.name).toBe("indexedDB");
  });

  it("keeps the entries two windows add in turn", async () => {
    const record = storedRecord(undefined);
    const first = aWindow(record);
    const second = aWindow(record);
    await first.load();
    await second.load();
    await first.change((s) => [...s, entry("record", { kind: "record" })]);
    // The second window still holds the shelf from before the record.
    const seen = await second.change((s) => [...s, entry("kept")]);
    expect(ids(seen)).toEqual(["kept", "record"]);
    expect(ids(await aWindow(record).load())).toEqual(["kept", "record"]);
  });

  it("keeps a deleted entry deleted while another window still holds it", async () => {
    const record = storedRecord(undefined);
    const first = aWindow(record);
    await first.load();
    await first.change(() => [entry("a"), entry("b")]);
    const second = aWindow(record);
    await second.load();
    await first.change((s) => s.filter((e) => e.id !== "a"));
    await second.change((s) => [...s, entry("c")]);
    expect(ids(await aWindow(record).load())).toEqual(["b", "c"]);
  });

  it("never writes over a stored record of a version it does not know", async () => {
    const future = { schemaVersion: 99, entries: [{ anything: true }] };
    const record = storedRecord(future);
    const store = replayStoreWithFallback(recordReplayStore(record));
    expect(await store.load()).toEqual([]);
    const saved = await store.save(shelf, journalAfter(EMPTY_JOURNAL, [], shelf));
    expect(saved.durable).toBe(false);
    expect(record.value()).toEqual(future);
    expect(saved.shelf).toEqual(shelf);
  });

  it("stores back the entries it could not read, as they were", async () => {
    const damaged = { id: "damaged", kind: "kept" };
    const record = storedRecord({ schemaVersion: 1, entries: [...shelf, damaged] });
    const store = recordReplayStore(record);
    expect(await store.load()).toEqual(shelf);
    await store.save([], journalAfter(EMPTY_JOURNAL, shelf, []));
    expect(record.value()).toEqual({ schemaVersion: 1, entries: [damaged] });
  });

  it("is kept in memory where the browser has no IndexedDB", () => {
    expect(detectReplayStore({}).name).toBe("memory");
  });
});
