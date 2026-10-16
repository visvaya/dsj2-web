import { useEffect, useReducer, useState } from "react";
import { reduceUpdateCheck, type OfflineState } from "../pwa/offline-state";
import { UI_TEXT } from "../text/ui-text";
import type { UpdateControls } from "./use-offline-state";

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
 *
 * With `onInstall` it also offers to install the release at once, which reloads the page. Only the main menu
 * passes it: on the jump screen a reload would end the jump that is paused there.
 */
export function UpdateNotice({
  state,
  onInstall,
}: {
  state: OfflineState | null;
  onInstall?: (() => void) | undefined;
}) {
  const shown = useLastingWait(state?.updateWaiting === true);
  return (
    <div aria-live="polite">
      {shown && state && !onInstall && (
        <p className="note framed-note update-note">{UI_TEXT.offline.updateWaiting(state.updateVersion)}</p>
      )}
      {shown && state && onInstall && (
        <div className="framed-note update-note install-note">
          <p className="note">{UI_TEXT.offline.updateWaiting(state.updateVersion)}</p>
          <button type="button" className="pixel-button small-button" onClick={onInstall}>
            {UI_TEXT.offline.installNow}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A button that looks for a new release now, and what it found, said in a live region beside it. Presses while
 * a check runs make no second check. A release that is found is stored in the background as any other, and
 * `UpdateNotice` offers it once it waits.
 */
export function UpdateCheck({ updates }: { updates: UpdateControls }) {
  const [check, dispatch] = useReducer(reduceUpdateCheck, "idle");
  const checking = check === "checking";
  const onCheck = () => {
    if (checking) return;
    dispatch("start");
    void updates.checkNow().then(dispatch);
  };
  return (
    <div className="update-check">
      <button type="button" className="pixel-button small-button" aria-disabled={checking} onClick={onCheck}>
        {UI_TEXT.offline.check.button}
      </button>
      {/* A region of its own, there before the first answer so that answer is announced. */}
      <div aria-live="polite">{check !== "idle" && <p className="note">{UI_TEXT.offline.check[check]}</p>}</div>
    </div>
  );
}
