/** What the page knows at the moment the mouse capture (pointer lock) ends. */
export interface LockLoss {
  /** The game let the mouse go itself (the jump ended, or the player left the screen). */
  releasedByGame: boolean;
  /** The page still has keyboard focus. */
  focused: boolean;
  /** The tab is hidden. */
  hidden: boolean;
}

/**
 * Browsers take Escape for themselves while the mouse is captured: the capture ends and the page may never see
 * the key. A capture that ends on a focused, visible page without the game asking is therefore read as Escape
 * and leaves the jump. Switching windows or tabs also ends the capture; the jump then just waits.
 */
export function lockLossAction(loss: LockLoss): "exit" | "stay" {
  if (loss.releasedByGame) return "stay";
  return loss.focused && !loss.hidden ? "exit" : "stay";
}

/**
 * Asks the browser to capture the mouse on `element`. Engines differ in how they refuse: newer ones return a
 * promise that rejects, older ones return nothing, and some throw. The game is playable without the capture, so
 * every refusal is ignored and the press that asked for it still counts.
 */
export function requestMouseCapture(element: { requestPointerLock: () => unknown }): void {
  try {
    const pending = element.requestPointerLock();
    if (pending instanceof Promise) pending.catch(() => undefined);
  } catch {
    // Refused outright (no user gesture, or a sandboxed frame).
  }
}
