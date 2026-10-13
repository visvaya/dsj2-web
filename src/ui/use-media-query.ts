import { useEffect, useState } from "react";

/** Whether a media query matches, kept up to date while the component lives. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The query for the game started from its own icon rather than in a tab of a browser. */
export const INSTALLED_QUERY = "(display-mode: standalone)";

/** The query for screens played with fingers rather than a mouse. */
export const TOUCH_QUERY = "(pointer: coarse)";
