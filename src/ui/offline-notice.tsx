import type { OfflineState } from "../pwa/offline-state";
import { OFFLINE_TEXT, UPDATE_WAITING_TEXT } from "../pwa/offline-text";

/**
 * Whether the game can be played without a network, and whether a newer release is waiting. The line about
 * the release is announced to screen readers when it appears; nothing here takes the focus.
 */
export function OfflineNotice({ state }: { state: OfflineState | null }) {
  if (state === null) return null;
  return (
    <div className="offline-notice">
      <p className="note">{OFFLINE_TEXT[state.readiness]}</p>
      <div aria-live="polite">{state.updateWaiting && <p className="note">{UPDATE_WAITING_TEXT}</p>}</div>
    </div>
  );
}
