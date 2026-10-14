import { describe, expect, it } from "vitest";
import { ENGINE_REVISION, encodeInputs, type Shelf } from "./replay-shelf";
import type { IdbRecord } from "./idb-record";
import {
  detectReplayStore,
  memoryReplayStore,
  recordReplayStore,
  replayStoreWithFallback,
  type ReplayStore,
} from "./replay-store";

/** A stored record in memory, as IndexedDB would keep it. */
function storedRecord(initial: unknown): IdbRecord & { value: () => unknown } {
  let value = initial;
  return {
    get: () => Promise.resolve(value),
    put: (next) => {
      value = JSON.parse(JSON.stringify(next));
      return Promise.resolve();
    },
    delete: () => {
      value = undefined;
      return Promise.resolve();
    },
    value: () => value,
  };
}

const shelf: Shelf = [
  {
    id: "a",
    kind: "kept",
    hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 },
    dateIso: "2026-10-14T12:00:00.000Z",
    result: { distanceM: 88.5, points: 101.5, fell: false },
    newRecord: false,
    engineRevision: ENGINE_REVISION,
    replay: { kind: "own", seed: 42, inputs: encodeInputs([{ left: true, right: false, dy: 3 }]) },
  },
];

describe("replay store", () => {
  it("round-trips the shelf", async () => {
    const store = memoryReplayStore();
    expect(await store.load()).toEqual([]);
    await store.save(shelf);
    expect(await store.load()).toEqual(shelf);
  });

  it("keeps the replays in memory once the browser store fails", async () => {
    const failing: ReplayStore = {
      name: "indexedDB",
      load: () => Promise.reject(new Error("blocked")),
      save: () => Promise.reject(new Error("blocked")),
    };
    const store = replayStoreWithFallback(failing);
    await store.save(shelf);
    expect(store.name).toBe("memory");
    expect(await store.load()).toEqual(shelf);
  });

  it("never writes over a stored record of a version it does not know", async () => {
    const future = { schemaVersion: 99, entries: [{ anything: true }] };
    const record = storedRecord(future);
    const store = replayStoreWithFallback(recordReplayStore(record));
    expect(await store.load()).toEqual([]);
    await store.save(shelf);
    expect(record.value()).toEqual(future);
    // The replays of this visit go on in memory.
    expect(store.name).toBe("memory");
    expect(await store.load()).toEqual(shelf);
  });

  it("stores back the entries it could not read, as they were", async () => {
    const damaged = { id: "damaged", kind: "kept" };
    const record = storedRecord({ schemaVersion: 1, entries: [...shelf, damaged] });
    const store = recordReplayStore(record);
    expect(await store.load()).toEqual(shelf);
    await store.save([]);
    expect(record.value()).toEqual({ schemaVersion: 1, entries: [damaged] });
  });

  it("is kept in memory where the browser has no IndexedDB", () => {
    expect(detectReplayStore({}).name).toBe("memory");
  });
});
