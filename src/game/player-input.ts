import { PHASE, type FrameInput } from "../sim/jump-logic";

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

/**
 * How long before the right zone a touch of the left zone still counts as pressed together with it, in
 * simulation frames (a tenth of a second). Fingers of two hands never land in the same frame.
 */
const TOUCH_CHORD_FRAMES = 7;

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

/**
 * In flight the left touch zone only leans. Any button pressed in flight starts the landing, and the left zone
 * is also where a finger drags to lean: were it a button there, a finger lifted from it could not come back
 * without landing. The right zone starts the landing; the left one is a button again once the landing has
 * begun, where the second button ends the preparation early. Both zones touched together are both buttons
 * at once, the landing on two feet: the collector takes a touch of the left zone that began just before the
 * right one for that, and a finger that has been leaning there for longer not.
 */
export function leftTouchLeansOnly(phase: number): boolean {
  return phase === PHASE.flightHold || phase === PHASE.flight;
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
  /**
   * While on, a touch on the left zone is not a press of the left button (see `leftTouchLeansOnly`). When it
   * goes off, a finger still on the zone stays unpressed until it lifts: only a new touch presses.
   */
  setLeftTouchLeansOnly: (on: boolean) => void;
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
  /** The left touch zone does not press: leaning only is on, or it ended under a finger that has not lifted. */
  let leftTouchMuted = false;
  let leansOnly = false;
  /** Frames since a touch of the left zone began while it did not press; a chord with the right zone is recent. */
  let mutedLeftTouchAgeFrames = Number.POSITIVE_INFINITY;

  const leftHeld = (): boolean => held.mouse.left || held.keys.left || (held.touch.left && !leftTouchMuted);
  const rightHeld = (): boolean => held.mouse.right || held.keys.right || held.touch.right;
  const setButtons = (source: ButtonSource, state: ButtonState): void => {
    if (source === "touch" && leftTouchMuted && state.left && !held.touch.left) mutedLeftTouchAgeFrames = 0;
    held = { ...held, [source]: { left: state.left, right: state.right } };
    if (source === "touch" && !state.left && !leansOnly) leftTouchMuted = false;
    const leftPressed = state.left && !(source === "touch" && leftTouchMuted);
    pressed = { left: pressed.left || leftPressed, right: pressed.right || state.right };
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
    setLeftTouchLeansOnly(on) {
      leansOnly = on;
      if (on) leftTouchMuted = true;
      else if (!held.touch.left) leftTouchMuted = false;
    },
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
      const right = rightHeld() || pressed.right;
      const chord = leftTouchMuted && right && mutedLeftTouchAgeFrames <= TOUCH_CHORD_FRAMES;
      const frame = { left: leftHeld() || pressed.left || chord, right, dy };
      pressed = { left: false, right: false };
      mutedLeftTouchAgeFrames += 1;
      return frame;
    },
    reset() {
      held = nothingHeld();
      pressed = { left: false, right: false };
      pendingDy = 0;
      leanKeys = 0;
      leftTouchMuted = false;
      leansOnly = false;
      mutedLeftTouchAgeFrames = Number.POSITIVE_INFINITY;
    },
  };
}
