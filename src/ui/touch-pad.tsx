import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { UI_TEXT } from "../text/ui-text";

interface TouchPadProps {
  side: "left" | "right";
  /** Accessible name; it starts with the name of the button the zone stands for. */
  label: string;
  /** What the zone does, one line each, under its letter. */
  hints: readonly string[];
  /** Out of reach of the pointer and the keyboard while the pause controls cover the zone. */
  inert: boolean;
  onPress: (down: boolean) => void;
  onDrag: (dy: number) => void;
}

/**
 * A touch zone standing in for a mouse button; dragging in the left one leans like the mouse. In flight the
 * left zone only leans and the right one lands (`leftTouchLeansOnly`).
 */
export function TouchPad({ side, label, hints, inert, onPress, onDrag }: TouchPadProps) {
  const lastY = useRef(new Map<number, number>());
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    lastY.current.delete(e.pointerId);
    if (lastY.current.size === 0) onPress(false);
  };
  return (
    <button
      type="button"
      className={`touch-pad touch-pad-${side}`}
      inert={inert}
      aria-label={label}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the press still counts.
        }
        lastY.current.set(e.pointerId, e.clientY);
        onPress(true);
      }}
      onPointerMove={(e) => {
        const prev = lastY.current.get(e.pointerId);
        if (prev === undefined) return;
        lastY.current.set(e.pointerId, e.clientY);
        onDrag(e.clientY - prev);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="touch-pad-key">{UI_TEXT.jumpScreen.padKey[side]}</span>
      {hints.map((hint) => (
        <span key={hint} className="touch-pad-hint">
          {hint}
        </span>
      ))}
    </button>
  );
}
