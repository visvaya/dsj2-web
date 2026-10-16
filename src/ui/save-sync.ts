import { mergedSave, type SaveData } from "../storage/save-data";
import { loadSave, type StorageBackend } from "../storage/save-store";

/** Where the windows of the game tell each other that the stored save changed. */
const SAVE_CHANNEL = "telemark-save";

/**
 * Keeps one window's save in step with the other windows of the game: after a write it tells them, and it reads
 * the save again when another window wrote and when the page is shown again, so the hill list and the check for a
 * new record work on the records of every window. What is read comes in by the same rule as a write (mergedSave):
 * per hill the record that stands, and the settings as stored, the last written.
 */
export function saveSync(backend: StorageBackend, setSave: (update: (current: SaveData) => SaveData) => void) {
  let channel: BroadcastChannel | null = null;
  const refresh = () => {
    void loadSave(backend).then((stored) => setSave((current) => mergedSave(current, stored)));
  };
  return {
    refresh,
    /** This window stored the save. */
    written: () => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
      channel?.postMessage("written");
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
