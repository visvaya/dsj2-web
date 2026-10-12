import { describe, expect, it } from "vitest";
import {
  GAME_FILES_SCHEMA_VERSION,
  memoryGameFilesStore,
  parseStoredGameFiles,
  withFallback,
  type GameFilesStore,
} from "./game-files-store";

describe("game files store", () => {
  it("round-trips the files and forgets them", async () => {
    const store = memoryGameFilesStore();
    expect(await store.load()).toEqual({});
    const exe = new Uint8Array([77, 90, 1]);
    const dat = new Uint8Array([9, 8]);
    await store.save({ exe, dat });
    expect(await store.load()).toEqual({ exe, dat });
    await store.clear();
    expect(await store.load()).toEqual({});
  });

  it("reads stored buffers and ignores unknown or damaged records", () => {
    const exe = new Uint8Array([1, 2, 3]);
    expect(parseStoredGameFiles({ schemaVersion: GAME_FILES_SCHEMA_VERSION, exe: exe.buffer })).toEqual({ exe });
    expect(parseStoredGameFiles({ schemaVersion: 99, exe })).toEqual({});
    expect(parseStoredGameFiles({ schemaVersion: GAME_FILES_SCHEMA_VERSION, exe: "MZ", dat: 5 })).toEqual({});
    expect(parseStoredGameFiles(null)).toEqual({});
  });

  it("falls back to memory when the browser store fails", async () => {
    const failing: GameFilesStore = {
      name: "indexedDB",
      load: () => Promise.reject(new Error("blocked")),
      save: () => Promise.reject(new Error("blocked")),
      clear: () => Promise.reject(new Error("blocked")),
    };
    const store = withFallback(failing);
    const exe = new Uint8Array([7]);
    await store.save({ exe });
    expect(store.name).toBe("memory");
    expect(await store.load()).toEqual({ exe });
  });
});
