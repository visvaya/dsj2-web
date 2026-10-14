import { idbRecord } from "./idb-record";
import { parseShelf, shelfRecord, type Shelf } from "./replay-shelf";

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

function indexedDbReplayStore(idb: IDBFactory): ReplayStore {
  const stored = idbRecord(idb, REPLAYS_PLACE);
  return {
    name: "indexedDB",
    load: async () => parseShelf(await stored.get()),
    save: (shelf) => stored.put(shelfRecord(shelf)),
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
    if (scope.indexedDB) return replayStoreWithFallback(indexedDbReplayStore(scope.indexedDB));
  } catch {
    // Access to indexedDB itself can throw in locked-down frames.
  }
  return memoryReplayStore();
}
