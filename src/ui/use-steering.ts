import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPlayerInput, thumbButtons, thumbsAfter, type ButtonSide } from "../game/player-input";
import { sensitivityGain } from "../game/sensitivity";
import {
  TILT_AT_REST,
  pitchDeg,
  requestTiltPermission,
  tiltAsksFirst,
  tiltSupported,
  type TiltState,
} from "../game/tilt-input";
import type { ControlScheme } from "../render/jump-view";
import type { Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";

/** How long a note about the motion sensor stays on screen. */
const TILT_NOTE_MS = 5000;
/** How long tilt steering waits for the first reading of the motion sensor before the finger takes over. */
const TILT_SENSOR_WAIT_MS = 3000;

/** Latest phone pitch, and where the phone was a frame ago (`tiltStep`). */
export interface TiltReading {
  on: boolean;
  pitch: number | null;
  follow: TiltState;
}

/** A phone that gives no reading soon after tilting is switched on has no sensor to tilt with. */
function useSensorCheck(tiltOn: boolean, sensedRef: RefObject<boolean>, giveUp: (note: string) => void) {
  useEffect(() => {
    if (!tiltOn) return undefined;
    const timer = setTimeout(() => {
      if (!sensedRef.current && !document.hidden) giveUp(UI_TEXT.jumpScreen.tiltNoSensor);
    }, TILT_SENSOR_WAIT_MS);
    return () => clearTimeout(timer);
  }, [tiltOn, sensedRef, giveUp]);
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
  /** Whether the player is to be asked about tilting: the browser gives the sensor only after a tap (iOS). */
  const [tiltQuestion, setTiltQuestion] = useState(false);
  /** Whether the motion sensor has given a reading since the page opened. */
  const sensedRef = useRef(false);
  /** The latest way to change the settings, for the timers and promises that outlive a render. */
  const onSettingsRef = useRef(onSettings);
  useEffect(() => {
    onSettingsRef.current = onSettings;
  });
  const controls: ControlScheme = touch ? (tiltOn ? "tilt" : "touch") : "mouse";

  // Notes about the motion sensor go away on their own.
  useEffect(() => {
    if (tiltNote === "") return undefined;
    const timer = setTimeout(() => setTiltNote(""), TILT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [tiltNote]);

  // Tilt steering (the default) is switched on where the browser gives the sensor without asking or remembers
  // the permission. Where it asks first, the player is asked, as the request needs a tap; where it has no sensor
  // at all, the finger leans the jumper from now on.
  const wantsTilt = settings.leanControl === "tilt";
  useEffect(() => {
    if (!touch || !wantsTilt) return undefined;
    if (!tiltSupported()) {
      onSettingsRef.current({ leanControl: "drag" });
      return undefined;
    }
    let cancelled = false;
    void requestTiltPermission().then((granted) => {
      if (cancelled) return;
      tiltRef.current.on = granted;
      tiltRef.current.follow = TILT_AT_REST;
      setTiltOn(granted);
      setTiltQuestion(!granted && tiltAsksFirst());
      if (!granted && !tiltAsksFirst()) onSettingsRef.current({ leanControl: "drag" });
    });
    return () => {
      cancelled = true;
    };
  }, [touch, wantsTilt]);

  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- screen.orientation is missing in Safari before 16.4
      tiltRef.current.pitch = pitchDeg(e.beta, e.gamma, screen.orientation?.angle ?? 0);
      // A browser without the sensor may still send an event, with no angles in it.
      if (e.beta !== null) sensedRef.current = true;
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, []);

  /** Lets go of the touch buttons when the way of steering changes under the player's fingers. */
  const releaseTouch = useCallback(() => {
    thumbsRef.current = [];
    inputRef.current.release("touch");
  }, []);
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
  /** The finger leans the jumper from now on, with a note saying why when there is one. */
  const fingerFromNowOn = useCallback(
    (note: string) => {
      tiltRef.current.on = false;
      releaseTouch();
      setTiltOn(false);
      setTiltQuestion(false);
      setTiltNote(note);
      onSettingsRef.current({ leanControl: "drag" });
    },
    [releaseTouch],
  );
  /** Asks the browser for the sensor, from a tap; tilting from now on if it gives it. */
  const askForTilt = () => {
    void requestTiltPermission().then((granted) => {
      if (!granted) {
        fingerFromNowOn(UI_TEXT.settings.tiltRefused);
        return;
      }
      tiltRef.current.on = true;
      tiltRef.current.follow = TILT_AT_REST;
      releaseTouch();
      setTiltOn(true);
      setTiltQuestion(false);
      setTiltNote("");
      onSettingsRef.current({ leanControl: "tilt" });
    });
  };

  useSensorCheck(tiltOn, sensedRef, fingerFromNowOn);

  /** Switches between leaning with a finger and by tilting the phone, which the browser has to allow. */
  const toggleTilt = () => {
    if (tiltOn) fingerFromNowOn("");
    else askForTilt();
  };
  /** The player's answer to the question about tilting: yes asks the browser, no keeps the finger. */
  const answerTiltQuestion = (yes: boolean) => {
    if (yes) askForTilt();
    else fingerFromNowOn("");
  };
  /** Nothing held and the phone taken as it is now, for a jump that starts again. */
  const resetHands = useCallback(() => {
    inputRef.current.reset();
    thumbsRef.current = [];
    tiltRef.current.follow = TILT_AT_REST;
  }, []);

  return {
    inputRef,
    tiltRef,
    controls,
    tiltOn,
    tiltNote,
    tiltQuestion,
    pressZone,
    dragZone,
    toggleTilt,
    answerTiltQuestion,
    resetHands,
  };
}
