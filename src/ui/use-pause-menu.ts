import { useCallback, useEffect, useRef, useState } from "react";

/** What the open menu shows: its buttons, or the instructions or the list of hills in their place. */
export type MenuPanel = "menu" | "help" | "hills";

/**
 * The menu of the jump screen. In phone landscape its buttons sit behind a pause button; the jump stops while
 * they are open, and the focus goes into them and back to the pause button after.
 */
export function usePauseMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>("menu");
  /** For the jump loop, which outlives a render. */
  const pausedRef = useRef(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpenRef = useRef(false);

  useEffect(() => {
    if (panel !== "menu") panelHeadingRef.current?.focus();
  }, [panel]);
  useEffect(() => {
    pausedRef.current = menuOpen;
    // The controls cover everything else, so the focus goes into them and returns to the pause button after.
    if (menuOpen) resumeButtonRef.current?.focus();
    else if (menuWasOpenRef.current) pauseButtonRef.current?.focus();
    menuWasOpenRef.current = menuOpen;
  }, [menuOpen]);

  const openMenu = useCallback(() => {
    setPanel("menu");
    setMenuOpen(true);
  }, []);
  const toggleMenu = useCallback(() => {
    setPanel("menu");
    setMenuOpen((open) => !open);
  }, []);
  const closeMenu = () => {
    setPanel("menu");
    setMenuOpen(false);
  };

  return {
    menuOpen,
    panel,
    setPanel,
    openMenu,
    toggleMenu,
    closeMenu,
    pausedRef,
    panelHeadingRef,
    pauseButtonRef,
    resumeButtonRef,
  };
}
