import { idbRecord, type IdbRecord } from "./idb-record";
import { parseShelf, readShelf, shelfRecord, type Shelf } from "./replay-shelf";

/** Keeps the shelf of replays between visits. */
export interface ReplayStore {
  /** "indexedDB" or "memory" (gone on reload). */
  readonly name: string;
  load: () => Promise<Shelf>;
  save: (shelf: Shelf) => Promise<void>;
}

/** A database of its own, so the replays never need an upgrade of the database of the game files. */
const REPLAYS_PLACE = { db: "telemark-replays", store: "replays", key: "shelf" } as const;

export function memoryReplayStore(): ReplayStore {
  let stored: object | null = null;
  return {
    name: "memory",
    load: () => Promise.resolve(parseShelf(stored)),
    save: (shelf) => {
      stored = shelfRecord(shelf);
      return Promise.resolve();
    },
  };
}

/** The stored record could not be read as a shelf of this game; it is left alone. */
class ForeignShelfError extends Error {
  constructor() {
    super("The stored replays are of a version this game does not know; they are not written over.");
    this.name = "ForeignShelfError";
  }
}

/** The shelf kept in one stored record (IndexedDB in the game, a stand-in in tests). */
export function recordReplayStore(stored: IdbRecord): ReplayStore {
  // What the last load could not read, to be stored back as it was; and whether the record is a foreign one.
  let unreadable: readonly unknown[] = [];
  let foreign = false;
  return {
    name: "indexedDB",
    load: async () => {
      const read = readShelf(await stored.get());
      unreadable = read.unreadable;
      foreign = read.foreign;
      return read.shelf;
    },
    save: (shelf) => {
      // Failing here moves the store to memory (replayStoreWithFallback) and leaves the record as it is.
      if (foreign) return Promise.reject(new ForeignShelfError());
      return stored.put(shelfRecord(shelf, unreadable));
    },
  };
}

/** Uses `primary` until it fails once, then keeps the replays in memory for the rest of the visit. */
export function replayStoreWithFallback(primary: ReplayStore): ReplayStore {
  let active = primary;
  const run = async <T>(op: (store: ReplayStore) => Promise<T>): Promise<T> => {
    try {
      return await op(active);
    } catch {
      active = memoryReplayStore();
      return op(active);
    }
  };
  return {
    get name() {
      return active.name;
    },
    load: () => run((s) => s.load()),
    save: (shelf) => run((s) => s.save(shelf)),
  };
}

/** IndexedDB where the browser offers it, otherwise memory. */
export function detectReplayStore(scope: { indexedDB?: IDBFactory } = globalThis): ReplayStore {
  try {
    if (scope.indexedDB) return replayStoreWithFallback(recordReplayStore(idbRecord(scope.indexedDB, REPLAYS_PLACE)));
  } catch {
    // Access to indexedDB itself can throw in locked-down frames.
  }
  return memoryReplayStore();
}
