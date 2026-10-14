import { useEffect, useRef } from "react";
import { createSoundEngine, type SoundEngine } from "../audio/sound-engine";

/** One sound engine per jump screen, for the jump loop to play on; it only listens to the game. */
export function useSoundEngine(enabled: boolean) {
  const soundRef = useRef<SoundEngine | null>(null);
  useEffect(() => {
    const engine = createSoundEngine();
    // Before the jump loop starts its clock: inside the first press, creating the context stalled the jump.
    engine.prepare();
    soundRef.current = engine;
    const unlock = () => engine.unlock();
    // Browsers start audio only after a gesture. On iOS a touch counts when the finger lifts (touchend,
    // pointerup), not when it lands, so all of these are listened to.
    const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    for (const g of gestures) window.addEventListener(g, unlock, { capture: true });
    return () => {
      for (const g of gestures) window.removeEventListener(g, unlock, { capture: true });
      soundRef.current = null;
      engine.dispose();
    };
  }, []);
  useEffect(() => {
    soundRef.current?.setEnabled(enabled);
  }, [enabled]);
  return soundRef;
}
