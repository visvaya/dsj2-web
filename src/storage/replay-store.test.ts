import { describe, expect, it } from "vitest";
import { ENGINE_REVISION, encodeInputs, type Shelf } from "./replay-shelf";
import { detectReplayStore, memoryReplayStore, replayStoreWithFallback, type ReplayStore } from "./replay-store";

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

  it("is kept in memory where the browser has no IndexedDB", () => {
    expect(detectReplayStore({}).name).toBe("memory");
  });
});
