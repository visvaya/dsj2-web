import { mouseButtons, type PlayerInput } from "../game/player-input";
import { lockLossAction, requestMouseCapture } from "../game/pointer-lock";

export interface PointerLockWatch {
  /** Frees the mouse when the canvas holds it, as the game's own doing (no menu follows). */
  release: () => void;
  /** Stops watching, and frees the mouse if the canvas still holds it. */
  dispose: () => void;
}

/**
 * Watches the capture of the mouse: it is captured during a jump and free between jumps, so the buttons around
 * the picture can be reached. A capture lost to the browser rather than to the game calls `onLost`.
 */
export function watchPointerLock(canvas: HTMLCanvasElement, input: PlayerInput, onLost: () => void): PointerLockWatch {
  let releasing = false;
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) {
      releasing = false;
      return;
    }
    // A release that happened while the mouse was captured elsewhere never arrives.
    input.release("mouse");
    const loss = { releasedByGame: releasing, focused: document.hasFocus(), hidden: document.hidden };
    releasing = false;
    if (lockLossAction(loss) === "menu") onLost();
  };
  document.addEventListener("pointerlockchange", onLockChange);
  return {
    release() {
      if (document.pointerLockElement !== canvas) return;
      releasing = true;
      document.exitPointerLock();
    },
    dispose() {
      document.removeEventListener("pointerlockchange", onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}

interface InputHandlers {
  /** Whether the menu is open: the mouse then does not lean, and keys other than Escape belong to the menu. */
  paused: () => boolean;
  /** Lean per mickey of vertical mouse motion. */
  mouseGain: () => number;
  /** The R key: the jump starts again. */
  restart: () => void;
  /** The Escape key: frees the mouse and opens the menu, or closes it. */
  escape: () => void;
}

/** What a key does to the input; false when the key is not one of the game's. */
function applyKey(input: PlayerInput, code: string, down: boolean, handlers: InputHandlers): boolean {
  switch (code) {
    case "KeyZ":
      input.setButton("keys", "left", down);
      return true;
    case "KeyX":
      input.setButton("keys", "right", down);
      return true;
    case "ArrowUp":
      input.setLeanKeys(down ? -1 : 0);
      return true;
    case "ArrowDown":
      input.setLeanKeys(down ? 1 : 0);
      return true;
    case "KeyR":
      if (down) handlers.restart();
      return true;
    default:
      return false;
  }
}

const onContextMenu = (e: Event) => e.preventDefault();

/** Feeds the mouse and the keyboard into `input` while the jump screen is up; returns what stops it. */
export function listenToPlayerInput(
  canvas: HTMLCanvasElement,
  input: PlayerInput,
  handlers: InputHandlers,
): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    e.preventDefault();
    if (document.pointerLockElement !== canvas) requestMouseCapture(canvas);
    input.setButtons("mouse", mouseButtons(e.buttons));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") input.setButtons("mouse", mouseButtons(e.buttons));
  };
  // A second button pressed or released while one is held arrives as a move, so moves carry the buttons too.
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || handlers.paused()) return;
    input.setButtons("mouse", mouseButtons(e.buttons));
    input.addMotion(e.movementY * handlers.mouseGain());
  };
  // Key and button releases are lost while another window has the focus.
  const onBlur = () => {
    input.release("mouse");
    input.release("keys");
    input.setLeanKeys(0);
  };
  const onKey = (e: KeyboardEvent, down: boolean) => {
    // While the menu is open the keys belong to its buttons; Escape still closes it, and a key let go still
    // counts, so nothing stays held.
    if (handlers.paused() && down && e.code !== "Escape") return;
    if (e.code === "Escape") {
      // Not every browser keeps Escape to itself while the mouse is captured; where the key arrives, it frees
      // the mouse and opens the menu, or closes it, in one press. The browser's own handling of the key is
      // left alone.
      if (down) handlers.escape();
      return;
    }
    if (applyKey(input, e.code, down, handlers)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
  const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
