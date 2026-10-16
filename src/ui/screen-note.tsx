import { useEffect, useState } from "react";
import { UI_TEXT } from "../text/ui-text";
import { useMediaQuery } from "./use-media-query";

const PORTRAIT_QUERY = "(orientation: portrait)";
/** How long the suggestion to turn the phone stays over a jump screen held upright. */
const LANDSCAPE_NOTE_MS = 8000;

/**
 * A short note over the jump screen: what became of the motion sensor, or, on a touch screen held upright, a
 * suggestion to turn it, once per visit and only until it is turned. The game plays either way.
 */
function useScreenNote(touch: boolean, jumping: boolean, tiltNote: string): string {
  const portrait = useMediaQuery(PORTRAIT_QUERY);
  const [suggesting, setSuggesting] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setSuggesting(false), LANDSCAPE_NOTE_MS);
    return () => clearTimeout(timer);
  }, []);
  // Turned once, the phone needs no more telling.
  if (suggesting && !portrait) setSuggesting(false);
  if (tiltNote !== "") return tiltNote;
  return touch && portrait && suggesting && jumping ? UI_TEXT.jumpScreen.turnLandscape : "";
}

/**
 * The note over the jump screen. It stays mounted, so the suggestion is shown once per visit whatever the menu
 * does, and the live region exists before its text (screen readers miss a region added with its text).
 */
export function ScreenNote(p: { touch: boolean; jumping: boolean; tiltNote: string; hidden: boolean }) {
  const note = useScreenNote(p.touch, p.jumping, p.tiltNote);
  return (
    <p className="screen-note" role="status">
      {p.hidden ? "" : note}
    </p>
  );
}
