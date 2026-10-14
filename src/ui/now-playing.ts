import { useEffect } from "react";
import { UI_TEXT } from "../text/ui-text";

/** The game's own icons, as the web app manifest lists them; the phone picks the size it needs. */
const ARTWORK: readonly MediaImage[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
];

/** What the phone shows of the game's sound, for training on a hill: the game, the hill and the game's icon. */
export function nowPlayingFor(hillLabel: string): MediaMetadataInit {
  return { title: UI_TEXT.appName, artist: UI_TEXT.nowPlaying.training(hillLabel), artwork: [...ARTWORK] };
}

/**
 * Names the game's sound for the phone while the jump screen is up. Without it a phone shows the bare address of
 * the page on its lock screen; where the browser has no Media Session, nothing happens.
 */
export function useNowPlaying(hillLabel: string): void {
  useEffect(() => {
    // Both are missing in browsers without Media Session, which the types do not allow for.
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return undefined;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata(nowPlayingFor(hillLabel));
    return () => {
      session.metadata = null;
    };
  }, [hillLabel]);
}
