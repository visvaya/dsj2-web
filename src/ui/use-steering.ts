import { useCallback, useEffect, useRef, useState } from "react";
import { createPlayerInput, thumbButtons, thumbsAfter, type ButtonSide } from "../game/player-input";
import { sensitivityGain } from "../game/sensitivity";
import { TILT_AT_REST, pitchDeg, requestTiltPermission, type TiltState } from "../game/tilt-input";
import type { ControlScheme } from "../render/jump-view";
import type { Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";

/** How long a note about the motion sensor stays on screen. */
const TILT_NOTE_MS = 5000;

/** Latest phone pitch, and where the phone was a frame ago (`tiltStep`). */
export interface TiltReading {
  on: boolean;
  pitch: number | null;
  follow: TiltState;
}

/**
 * The player's hands on the jump screen: the input the jump loop reads, the touch zones, and the choice between
 * leaning with a finger and by tilting the phone.
 */
export function useSteering(touch: boolean, settings: Settings, onSettings: (change: Partial<Settings>) => void) {
  const inputRef = useRef(createPlayerInput());
  const tiltRef = useRef<TiltReading>({ on: false, pitch: null, follow: TILT_AT_REST });
  /** With tilt steering: the halves of the screen being touched, in the order they were touched. */
  const thumbsRef = useRef<readonly ButtonSide[]>([]);
  const [tiltOn, setTiltOn] = useState(false);
  const [tiltNote, setTiltNote] = useState("");
  const controls: ControlScheme = touch ? (tiltOn ? "tilt" : "touch") : "mouse";

  // Notes about the motion sensor go away on their own.
  useEffect(() => {
    if (tiltNote === "") return undefined;
    const timer = setTimeout(() => setTiltNote(""), TILT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [tiltNote]);

  // A saved choice of tilt steering is switched on again where the browser remembers the permission.
  const wantsTilt = settings.leanControl === "tilt";
  useEffect(() => {
    if (!touch || !wantsTilt) return undefined;
    let cancelled = false;
    void requestTiltPermission().then((granted) => {
      if (cancelled) return;
      tiltRef.current.on = granted;
      tiltRef.current.follow = TILT_AT_REST;
      setTiltOn(granted);
      setTiltNote(granted ? "" : UI_TEXT.jumpScreen.tiltHint);
    });
    return () => {
      cancelled = true;
    };
  }, [touch, wantsTilt]);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- screen.orientation is missing in Safari before 16.4
      tiltRef.current.pitch = pitchDeg(e.beta, e.gamma, screen.orientation?.angle ?? 0);
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, []);

  /** Lets go of the touch buttons when the way of steering changes under the player's fingers. */
  const releaseTouch = () => {
    thumbsRef.current = [];
    inputRef.current.release("touch");
  };
  /** A touch of a zone, or of a half of the screen with tilt steering, as game buttons. */
  const pressZone = (side: ButtonSide, down: boolean) => {
    if (!tiltRef.current.on) {
      inputRef.current.setButton("touch", side, down);
      return;
    }
    thumbsRef.current = thumbsAfter(thumbsRef.current, side, down);
    inputRef.current.setButtons("touch", thumbButtons(thumbsRef.current));
  };
  /** A drag on the left zone leans like the mouse; with tilt steering a finger resting there must not add to it. */
  const dragZone = (dy: number) => {
    if (!tiltRef.current.on) inputRef.current.addMotion(dy * sensitivityGain(settings.sensitivity.drag));
  };
  /** Switches between leaning with a finger and by tilting the phone, which the browser has to allow. */
  const toggleTilt = () => {
    if (tiltOn) {
      tiltRef.current.on = false;
      releaseTouch();
      setTiltOn(false);
      setTiltNote("");
      onSettings({ leanControl: "drag" });
      return;
    }
    void requestTiltPermission().then((granted) => {
      tiltRef.current.on = granted;
      tiltRef.current.follow = TILT_AT_REST;
      releaseTouch();
      setTiltOn(granted);
      setTiltNote(granted ? "" : UI_TEXT.settings.tiltRefused);
      if (granted) onSettings({ leanControl: "tilt" });
    });
  };
  /** Nothing held and the phone taken as it is now, for a jump that starts again. */
  const resetHands = useCallback(() => {
    inputRef.current.reset();
    thumbsRef.current = [];
    tiltRef.current.follow = TILT_AT_REST;
  }, []);

  return { inputRef, tiltRef, controls, tiltOn, tiltNote, pressZone, dragZone, toggleTilt, resetHands };
}
