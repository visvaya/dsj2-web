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
 * That a newer release is waiting and how to get it, framed so it is seen: at the top of the main menu and in the
 * menu of the jump screen. It is announced to screen readers when it appears; nothing here takes the focus.
 */
export function UpdateNotice({ state }: { state: OfflineState | null }) {
  return (
    <div aria-live="polite">
      {state?.updateWaiting === true && (
        <p className="note framed-note update-note">{UI_TEXT.offline.updateWaiting(state.updateVersion)}</p>
      )}
    </div>
  );
}
