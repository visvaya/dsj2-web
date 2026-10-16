import { mergedSave, type SaveData } from "../storage/save-data";
import { readSave, type StorageBackend } from "../storage/save-store";

/** Where the windows of the game tell each other that the stored save changed. */
const SAVE_CHANNEL = "telemark-save";

/**
 * Keeps one window's save in step with the other windows of the game: after a write it tells them, and it reads
 * the save again when another window wrote and when the page is shown again, so the hill list and the check for a
 * new record work on the records of every window. What is read comes in by the same rule as a write (mergedSave):
 * per hill the record that stands, and the settings as stored, the last written, unless this window is storing
 * its own meanwhile.
 */
export function saveSync(backend: StorageBackend, setSave: (update: (current: SaveData) => SaveData) => void) {
  let channel: BroadcastChannel | null = null;
  // Saves of this window begun and not yet ended, and how many were begun in all.
  let inFlight = 0;
  let begun = 0;
  const refresh = () => {
    const begunBefore = begun;
    void readSave(backend).then((stored) => {
      // Nothing readable (no save, a broken one, a failing storage): nothing to take in.
      if (stored === null) return;
      // A save of this window under way, or begun since the read, may hold settings newer than the ones read: then
      // only the records come in, and this window's settings stay until its save is stored.
      const ownSettings = inFlight > 0 || begun !== begunBefore;
      setSave((current) => (ownSettings ? mergedSave(stored, current) : mergedSave(current, stored)));
    });
  };
  return {
    refresh,
    /** This window begins to store the save; the call it gives back ends that, saying whether it was stored. */
    saving: () => {
      inFlight += 1;
      begun += 1;
      return (stored: boolean) => {
        inFlight -= 1;
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
        if (stored) channel?.postMessage("written");
      };
    },
    /** Listens for the other windows and for the page being shown again; gives back the means to stop. */
    connect: () => {
      const page = typeof document === "object" ? document : null;
      const onVisible = () => {
        if (page?.visibilityState === "visible") refresh();
      };
      try {
        channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(SAVE_CHANNEL) : null;
      } catch {
        channel = null;
      }
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
