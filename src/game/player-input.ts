import type { FrameInput } from "../sim/jump-logic";

/** The original clamps the mouse motion of one frame to a signed byte. */
const MOTION_LIMIT = 127;
/** Motion per frame while a lean key is held (keyboard alternative to the mouse). */
const KEY_LEAN_PER_FRAME = 6;

/** Where a held button comes from; a button counts as held while any source holds it. */
export type ButtonSource = "mouse" | "keys" | "touch";
export type ButtonSide = "left" | "right";
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
export class PlayerInput {
  private held = nothingHeld();
  /** Presses since the last frame; a press shorter than a frame still reaches the game for one frame. */
  private pressed: ButtonState = { left: false, right: false };
  private pendingDy = 0;
  private leanKeys = 0;

  get left(): boolean {
    return this.held.mouse.left || this.held.keys.left || this.held.touch.left;
  }

  get right(): boolean {
    return this.held.mouse.right || this.held.keys.right || this.held.touch.right;
  }

  setButton(source: ButtonSource, side: ButtonSide, down: boolean): void {
    this.setButtons(source, { ...this.held[source], [side]: down });
  }

  setButtons(source: ButtonSource, state: ButtonState): void {
    this.held = { ...this.held, [source]: { left: state.left, right: state.right } };
    this.pressed = { left: this.pressed.left || state.left, right: this.pressed.right || state.right };
  }

  /** Lets go of what a source held, for when its release can no longer arrive (capture or focus lost). */
  release(source: ButtonSource): void {
    this.setButtons(source, { left: false, right: false });
  }

  addMotion(dy: number): void {
    this.pendingDy += dy;
  }

  setLeanKeys(direction: -1 | 0 | 1): void {
    this.leanKeys = direction;
  }

  /** Input for the next simulation frame; consumes the pending motion. */
  takeFrame(): FrameInput {
    const raw = Math.round(this.pendingDy) + this.leanKeys * KEY_LEAN_PER_FRAME;
    this.pendingDy = 0;
    const dy = Math.max(-MOTION_LIMIT - 1, Math.min(MOTION_LIMIT, raw));
    const frame = { left: this.left || this.pressed.left, right: this.right || this.pressed.right, dy };
    this.pressed = { left: false, right: false };
    return frame;
  }

  reset(): void {
    this.held = nothingHeld();
    this.pressed = { left: false, right: false };
    this.pendingDy = 0;
    this.leanKeys = 0;
  }
}
