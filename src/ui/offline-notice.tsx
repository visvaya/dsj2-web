import { useEffect, useState } from "react";
import type { OfflineState } from "../pwa/offline-state";
import { UI_TEXT } from "../text/ui-text";

/** Whether the game can be played without a network. */
export function OfflineNotice({ state }: { state: OfflineState | null }) {
  if (state === null) return null;
  return (
    <div className="offline-notice">
      <p className="note">{UI_TEXT.offline.readiness[state.readiness]}</p>
    </div>
  );
}

/**
 * How long a release has to wait before the note about it shows. On the first launch after an update the browser
 * may report the new release as waiting for a moment before it takes over; a note for that moment would flash.
 */
const UPDATE_NOTE_AFTER_MS = 1500;

/** Whether a release has been waiting for a while, not only for the moment of a takeover. */
function useLastingWait(waiting: boolean): boolean {
  const [lasting, setLasting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setLasting(true), UPDATE_NOTE_AFTER_MS);
    // Once the release no longer waits, a later one waits its own while again.
    return () => {
      clearTimeout(timer);
      setLasting(false);
    };
  }, [waiting]);
  return waiting && lasting;
}

/**
 * That a newer release is waiting and how to get it, framed so it is seen: at the top of the main menu and in the
 * menu of the jump screen. It is announced to screen readers when it appears; nothing here takes the focus. The
 * region is empty until then and sits inside a block of its own place, so it leaves no gap in a column of buttons.
 */
export function UpdateNotice({ state }: { state: OfflineState | null }) {
  const shown = useLastingWait(state?.updateWaiting === true);
  return (
    <div aria-live="polite">
      {shown && state && (
        <p className="note framed-note update-note">{UI_TEXT.offline.updateWaiting(state.updateVersion)}</p>
      )}
    </div>
  );
}
