import { useEffect, type RefObject } from "react";

/**
 * Moves the keyboard focus to `target`, an element of a screen, when the screen appears. The control that opened the screen
 * is gone by then; without this the focus falls back to the page body, so a keyboard user starts again from the
 * top and a screen reader says nothing about the new screen.
 */
export function useEntryFocus(target: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (enabled) target.current?.focus();
  }, [target, enabled]);
}
