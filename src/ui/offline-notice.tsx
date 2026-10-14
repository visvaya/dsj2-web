import type { OfflineState } from "../pwa/offline-state";
import { UI_TEXT } from "../text/ui-text";

/**
 * Whether the game can be played without a network, and whether a newer release is waiting. The line about
 * the release is announced to screen readers when it appears; nothing here takes the focus.
 */
export function OfflineNotice({ state }: { state: OfflineState | null }) {
  if (state === null) return null;
  return (
    <div className="offline-notice">
      <p className="note">{UI_TEXT.offline.readiness[state.readiness]}</p>
      <div aria-live="polite">{state.updateWaiting && <p className="note">{UI_TEXT.offline.updateWaiting}</p>}</div>
    </div>
  );
}
