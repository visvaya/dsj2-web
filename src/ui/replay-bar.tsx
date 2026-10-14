import { useEffect, useRef, type RefObject } from "react";
import { UI_TEXT } from "../text/ui-text";
import type { ReplayPosition } from "./jump-runs";
import { formatDecimal } from "./number-text";

const T = UI_TEXT.jumpScreen.replay;
/** Simulation frames per second, for the time a moment of a replay is told in. */
const FRAMES_PER_S = 70;
const secondsOf = (frame: number): string => formatDecimal(frame / FRAMES_PER_S, 1);

interface Props {
  /** Where the replay being watched is; null before it has started. */
  position: () => ReplayPosition | null;
  /** Goes to a moment of the replay. */
  onSeek: (frame: number) => void;
}

/** Puts a moment of the replay on the slider and on the time beside it. */
function show(
  inputRef: RefObject<HTMLInputElement | null>,
  timeRef: RefObject<HTMLSpanElement | null>,
  at: ReplayPosition,
): void {
  const input = inputRef.current;
  const time = timeRef.current;
  if (input === null) return;
  input.max = String(at.length);
  input.value = String(at.frame);
  input.setAttribute("aria-valuetext", T.positionValue(secondsOf(at.frame), secondsOf(at.length)));
  if (time) time.textContent = T.positionShort(secondsOf(at.frame), secondsOf(at.length));
}

/**
 * A slider under the picture of a replay. It follows the replay as it plays, straight on the page rather than
 * through a render per frame, and stands still under the finger; moving it goes to that moment.
 */
export function ReplayBar({ position, onSeek }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const held = useRef(false);
  useEffect(() => {
    let frameId = 0;
    let shown: ReplayPosition | null = null;
    const follow = () => {
      const at = position();
      const moved = at !== null && (shown === null || at.frame !== shown.frame || at.length !== shown.length);
      if (at !== null && moved && !held.current) {
        shown = at;
        show(inputRef, timeRef, at);
      }
      frameId = requestAnimationFrame(follow);
    };
    frameId = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frameId);
  }, [position]);
  const release = () => {
    held.current = false;
  };
  return (
    <div className="replay-bar">
      <input
        ref={inputRef}
        type="range"
        min={1}
        max={1}
        defaultValue={1}
        aria-label={T.position}
        onPointerDown={() => {
          held.current = true;
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onBlur={release}
        onChange={(e) => {
          const frame = Number(e.currentTarget.value);
          onSeek(frame);
          show(inputRef, timeRef, { frame, length: Number(e.currentTarget.max) });
        }}
      />
      <span className="replay-bar-time" aria-hidden="true" ref={timeRef} />
    </div>
  );
}
