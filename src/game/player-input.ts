import type { FrameInput } from "../sim/jump-logic";

/** The original clamps the mouse motion of one frame to a signed byte. */
const MOTION_LIMIT = 127;
/** Motion per frame while a lean key is held (keyboard alternative to the mouse). */
const KEY_LEAN_PER_FRAME = 6;

/** Where a held button comes from; a button counts as held while any source holds it. */
type ButtonSource = "mouse" | "keys" | "touch";
type ButtonSide = "left" | "right";
export interface ButtonState {
  left: boolean;
  right: boolean;
}

const MASK_LEFT = 1;
const MASK_RIGHT = 2;

/**
 * Game buttons from the mask of held mouse buttons (`buttons` of a pointer event). The mask is read instead of
 * the button that changed, because a second button pressed or released while another is held arrives as a
 * move event, not as a press or a release.
 */
export function mouseButtons(mask: number): ButtonState {
  return { left: (mask & MASK_LEFT) !== 0, right: (mask & MASK_RIGHT) !== 0 };
}

const nothingHeld = (): Record<ButtonSource, ButtonState> => ({
  mouse: { left: false, right: false },
  keys: { left: false, right: false },
  touch: { left: false, right: false },
});

/**
 * Collects mouse, keyboard and touch input between simulation frames. `left` and
 * `right` are the held state of the buttons, `dy` the vertical motion since
 * the previous frame, as read by 0baf:9a3c.
 */
interface PlayerInput {
  readonly left: boolean;
  readonly right: boolean;
  setButton: (source: ButtonSource, side: ButtonSide, down: boolean) => void;
  setButtons: (source: ButtonSource, state: ButtonState) => void;
  /** Lets go of what a source held, for when its release can no longer arrive (capture or focus lost). */
  release: (source: ButtonSource) => void;
  addMotion: (dy: number) => void;
  setLeanKeys: (direction: -1 | 0 | 1) => void;
  /** Input for the next simulation frame; consumes the pending motion. */
  takeFrame: () => FrameInput;
  reset: () => void;
}

export function createPlayerInput(): PlayerInput {
  let held = nothingHeld();
  /** Presses since the last frame; a press shorter than a frame still reaches the game for one frame. */
  let pressed: ButtonState = { left: false, right: false };
  let pendingDy = 0;
  let leanKeys = 0;

  const leftHeld = (): boolean => held.mouse.left || held.keys.left || held.touch.left;
  const rightHeld = (): boolean => held.mouse.right || held.keys.right || held.touch.right;
  const setButtons = (source: ButtonSource, state: ButtonState): void => {
    held = { ...held, [source]: { left: state.left, right: state.right } };
    pressed = { left: pressed.left || state.left, right: pressed.right || state.right };
  };

  return {
    get left() {
      return leftHeld();
    },
    get right() {
      return rightHeld();
    },
    setButton(source, side, down) {
      setButtons(source, { ...held[source], [side]: down });
    },
    setButtons,
    release(source) {
      setButtons(source, { left: false, right: false });
    },
    addMotion(dy) {
      pendingDy += dy;
    },
    setLeanKeys(direction) {
      leanKeys = direction;
    },
    takeFrame() {
      const raw = Math.round(pendingDy) + leanKeys * KEY_LEAN_PER_FRAME;
      pendingDy = 0;
      const dy = Math.max(-MOTION_LIMIT - 1, Math.min(MOTION_LIMIT, raw));
      const frame = { left: leftHeld() || pressed.left, right: rightHeld() || pressed.right, dy };
      pressed = { left: false, right: false };
      return frame;
    },
    reset() {
      held = nothingHeld();
      pressed = { left: false, right: false };
      pendingDy = 0;
      leanKeys = 0;
    },
  };
}
