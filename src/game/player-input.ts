import type { FrameInput } from "../sim/jump-logic";

/** The original clamps the mouse motion of one frame to a signed byte. */
export const MOTION_LIMIT = 127;
/** Motion per frame while a lean key is held (keyboard alternative to the mouse). */
export const KEY_LEAN_PER_FRAME = 6;

/**
 * Collects mouse (or keyboard) input between simulation frames. `left` and
 * `right` are the held state of the buttons, `dy` the vertical motion since
 * the previous frame, as read by 0baf:9a3c.
 */
export class PlayerInput {
  left = false;
  right = false;
  private pendingDy = 0;
  private leanKeys = 0;

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
    return { left: this.left, right: this.right, dy };
  }

  reset(): void {
    this.left = false;
    this.right = false;
    this.pendingDy = 0;
    this.leanKeys = 0;
  }
}
