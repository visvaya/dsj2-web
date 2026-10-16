import type { Shelf } from "../storage/replay-shelf";
import type { ReplayStore } from "../storage/replay-store";
import { EMPTY_JOURNAL, journalAfter, journalAfterWrite, mergedShelf, type ShelfJournal } from "../storage/shelf-merge";

/** Where the windows of the game tell each other that the stored shelf changed. */
const SHELF_CHANNEL = "telemark-replays";

/** A channel to the other windows of the game, or null where the browser has none (each window then reads on return). */
function shelfChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(SHELF_CHANNEL) : null;
  } catch {
    return null;
  }
}

/** How the window's shelf is changed from outside React's render. */
interface ShelfSyncTarget {
  setShelf: (update: (current: Shelf) => Shelf) => void;
  setStoreName: (name: string) => void;
  /** The clean-up of the player's settings, applied to a shelf taken from the store as to any other. */
  clean: (shelf: Shelf) => Shelf;
}

export const SHELF_SYNC = {
  /** The wait before a failed read (the first of the visit above all) is tried again. */
  READ_RETRY_MS: 2000,
  /** Reads tried again on their own after a failure; every return to the page tries once more. */
  READ_RETRIES: 3,
} as const;

/**
 * Keeps one window's shelf in step with the store and with the other windows of the game. It writes down what the
 * window adds and deletes (the journal), stores the shelf one write at a time, merged with what is stored (see
 * mergedShelf), and takes the merged shelf back; it reads the store again when another window says it wrote and
 * when the page is shown again. A failed write is tried again with the next change or the next return; a failed
 * read is tried again after a while.
 */
export function shelfSync(store: ReplayStore, target: ShelfSyncTarget) {
  let journal: ShelfJournal = EMPTY_JOURNAL;
  // Whether the window changed its shelf since its last write, and how many changes it made: a shelf from the
  // store is taken only when no change came after the write or read began (the next write merges it anyway).
  let unwritten = false;
  let changes = 0;
  let latest: Shelf = [];
  // Whether the last write failed: the window then holds what only a write can store, so a refresh writes.
  let writeFailed = false;
  let queue: Promise<void> = Promise.resolve();
  let channel: BroadcastChannel | null = null;

  const enqueue = (op: () => Promise<void>) => {
    // The fallback store does not fail on a write; should anything else, the queue goes on with the next one.
    queue = queue.then(op).catch(() => undefined);
  };

  /** Takes the stored shelf, cleaned up as the settings ask; what the clean-up drops counts as this window's. */
  const adopt = (from: Shelf, at: number) => {
    if (changes === at) {
      target.setShelf((current) => {
        const merged = mergedShelf(from, current, journal);
        const after = target.clean(merged);
        if (after.length !== merged.length) {
          journal = journalAfter(journal, merged, after);
          unwritten = true;
        }
        return after;
      });
    }
    target.setStoreName(store.name);
  };

  /** Stores the latest shelf; writes go one at a time, so an older one never lands after a newer one. */
  const write = () =>
    enqueue(async () => {
      if (!unwritten) return;
      unwritten = false;
      const at = changes;
      const sent = journal;
      const saved = await store.save(latest, sent);
      writeFailed = !saved.durable;
      if (saved.durable) {
        journal = journalAfterWrite(journal, sent);
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
        channel?.postMessage("written");
      }
      adopt(saved.shelf, at);
    });

  /** Reads the store; a failed read is tried again `retries` times after a while. */
  const read = (retries: number) =>
    enqueue(async () => {
      const at = changes;
      try {
        adopt(await store.load(), at);
      } catch {
        target.setStoreName(store.name);
        if (retries > 0) setTimeout(() => read(retries - 1), SHELF_SYNC.READ_RETRY_MS);
      }
    });

  /** Reads what others stored; writes instead after a failed write, so the store that failed is tried again. */
  const refresh = () => {
    if (writeFailed) {
      unwritten = true;
      write();
      return;
    }
    read(0);
  };

  return {
    journal: () => journal,
    refresh,
    /** The first read of the visit failed: it is tried again after a while (and on every return to the page). */
    readLater: () => {
      setTimeout(() => read(SHELF_SYNC.READ_RETRIES - 1), SHELF_SYNC.READ_RETRY_MS);
    },
    /** A change made in this window, from `before` to `after`. */
    changed: (before: Shelf, after: Shelf) => {
      journal = journalAfter(journal, before, after);
      unwritten = true;
      changes += 1;
    },
    /** The shelf the window shows now; stored when it changed since the last write. */
    shown: (shelf: Shelf) => {
      latest = shelf;
      write();
    },
    /** Listens for the other windows and for the page being shown again; gives back the means to stop. */
    connect: () => {
      const page = typeof document === "object" ? document : null;
      const onVisible = () => {
        if (page?.visibilityState === "visible") refresh();
      };
      channel = shelfChannel();
      channel?.addEventListener("message", refresh);
      page?.addEventListener("visibilitychange", onVisible);
      return () => {
        page?.removeEventListener("visibilitychange", onVisible);
        channel?.close();
        channel = null;
      };
    },
  };
}
