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

/** How the window's shelf is changed from outside React's render: a state update and the name of the store. */
interface ShelfSyncTarget {
  setShelf: (update: (current: Shelf) => Shelf) => void;
  setStoreName: (name: string) => void;
}

/**
 * Keeps one window's shelf in step with the store and with the other windows of the game. It writes down what the
 * window adds and deletes (the journal), stores the shelf one write at a time, merged with what is stored (see
 * mergedShelf), and takes the merged shelf back; it reads the store again when another window says it wrote and
 * when the page is shown again. A write that fails is tried again with the next change or the next return.
 */
export function shelfSync(store: ReplayStore, target: ShelfSyncTarget) {
  let journal: ShelfJournal = EMPTY_JOURNAL;
  // Whether the window changed its shelf since its last write, and how many changes it made: a shelf from the
  // store is taken only when no change came after the write or read began (the next write merges it anyway).
  let unwritten = false;
  let changes = 0;
  let latest: Shelf = [];
  let queue: Promise<void> = Promise.resolve();
  let channel: BroadcastChannel | null = null;

  const adopt = (from: Shelf, at: number) => {
    if (changes === at) target.setShelf((current) => mergedShelf(from, current, journal));
    target.setStoreName(store.name);
  };

  /** Stores the latest shelf; writes go one at a time, so an older one never lands after a newer one. */
  const write = () => {
    queue = queue.then(async () => {
      if (!unwritten) return;
      unwritten = false;
      const at = changes;
      const saved = await store.save(latest, journal);
      if (saved.durable) {
        journal = journalAfterWrite(journal, saved.shelf);
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
        channel?.postMessage("written");
      }
      adopt(saved.shelf, at);
    });
    // The fallback store does not fail; should anything else, the queue goes on with the next operation.
    queue = queue.catch(() => undefined);
  };

  /** Reads what others stored; writes instead while the window holds what a failed write could not store. */
  const refresh = () => {
    if (journal.added.size > 0) {
      unwritten = true;
      write();
      return;
    }
    queue = queue.then(async () => {
      const at = changes;
      adopt(await store.load(), at);
    });
  };

  return {
    journal: () => journal,
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
      const onVisible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      channel = shelfChannel();
      channel?.addEventListener("message", refresh);
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        channel?.close();
        channel = null;
      };
    },
  };
}
