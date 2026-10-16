import { idbRecord, type IdbRecord } from "./idb-record";
import { readShelf, shelfRecord, type Shelf } from "./replay-shelf";
import { mergedShelf, type ShelfJournal } from "./shelf-merge";

/** What a write gave back: the shelf as merged with what was stored, and whether it is stored for later visits. */
interface SavedShelf {
  shelf: Shelf;
  /**
   * False when the browser store failed: the shelf lives on in this window, and the next write, with the journal
   * unchanged, puts in what this one could not. When true, the journal goes on as journalAfterWrite makes it.
   */
  durable: boolean;
}

/** Keeps the shelf of replays between visits. */
export interface ReplayStore {
  /** "indexedDB", or "memory" where the replays last only for the visit (no store, or it keeps failing). */
  readonly name: string;
  load: () => Promise<Shelf>;
  /**
   * Merges the window's shelf with the stored one (see mergedShelf) and stores the result, so a window holding an
   * older shelf never writes over what another window stored.
   */
  save: (shelf: Shelf, journal: ShelfJournal) => Promise<SavedShelf>;
}

export const REPLAY_STORE = {
  /** Failed operations in a row before the player is told the replays may not outlast the visit. */
  FAILURES_BEFORE_NOTICE: 2,
} as const;

/** A database of its own, so the replays never need an upgrade of the database of the game files. */
const REPLAYS_PLACE = { db: "telemark-replays", store: "replays", key: "shelf" } as const;

export function memoryReplayStore(): ReplayStore {
  let stored: Shelf = [];
  return {
    name: "memory",
    load: () => Promise.resolve(stored),
    save: (shelf, journal) => {
      stored = mergedShelf(stored, shelf, journal);
      return Promise.resolve({ shelf: stored, durable: false });
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
  return {
    name: "indexedDB",
    load: async () => readShelf(await stored.get()).shelf,
    save: async (shelf, journal) => {
      let merged: Shelf = shelf;
      // Read, merged and written in one transaction: no other window writes between.
      await stored.update((current) => {
        const read = readShelf(current);
        // Failing here leaves the record as it is (replayStoreWithFallback keeps the shelf for the visit).
        if (read.foreign) throw new ForeignShelfError();
        merged = mergedShelf(read.shelf, shelf, journal);
        // What could not be read is stored back as it was.
        return shelfRecord(merged, read.unreadable);
      });
      return { shelf: merged, durable: true };
    },
  };
}

/**
 * Uses `primary`, and keeps the shelf in memory for any operation it fails, so nothing of the visit is lost; every
 * operation tries `primary` again, so one failed write (a store busy in another tab, a full disk freed since)
 * costs nothing once the next one succeeds. After repeated failures in a row the store reports itself as memory,
 * for the game to tell the player, until an operation succeeds again.
 */
export function replayStoreWithFallback(primary: ReplayStore): ReplayStore {
  // The last shelf the store read or wrote, or kept when it could not: what a failed operation gives back.
  let mirror: Shelf = [];
  let failures = 0;
  let known = false;
  return {
    get name() {
      return failures >= REPLAY_STORE.FAILURES_BEFORE_NOTICE ? "memory" : primary.name;
    },
    load: async () => {
      try {
        mirror = await primary.load();
        failures = 0;
        known = true;
      } catch (error) {
        failures += 1;
        // Before any read or write succeeded, the shelf of the store is not known: the caller tries again later.
        if (!known) throw error;
      }
      return mirror;
    },
    save: async (shelf, journal) => {
      try {
        const saved = await primary.save(shelf, journal);
        failures = 0;
        mirror = saved.shelf;
        known = true;
        return saved;
      } catch {
        failures += 1;
        // Not stored: the journal stays as it was, so the next write puts in what this one could not.
        mirror = mergedShelf(mirror, shelf, journal);
        return { shelf: mirror, durable: false };
      }
    },
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
