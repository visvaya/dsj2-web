import { useEffect, useState } from "react";
import { canVibrate } from "../game/haptics";
import {
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  sensitivityFor,
  stepSensitivity,
  withSensitivity,
} from "../game/sensitivity";
import type { SceneryChoice, Settings } from "../storage/save-data";
import type { Steering } from "./how-to-jump-text";
import { useMediaQuery } from "./use-media-query";

const NEXT_SCENERY: Readonly<Record<SceneryChoice, SceneryChoice>> = {
  varied: "day",
  day: "dusk",
  dusk: "night",
  night: "varied",
};
const SCENERY_LABEL: Readonly<Record<SceneryChoice, string>> = {
  varied: "zmienna",
  day: "dzień",
  dusk: "zmierzch",
  night: "noc",
};

/** Said when the browser does not hand out the motion sensor that tilt steering needs. */
export const TILT_REFUSED = "Brak zgody na czujnik ruchu: pochylanie palcem.";
/** Said when the page is asked to leave a full screen that the browser, not the page, switched on. */
const BROWSER_FULLSCREEN_NOTE = "Ten pełny ekran włączyła przeglądarka. Wyłączysz go klawiszem F11.";
/** The display mode a browser reports for its own full screen (F11) as well as for the page's. */
const FULLSCREEN_QUERY = "(display-mode: fullscreen)";

/** Whether the page fills the screen, and whether that is the page's own full screen, which it can leave. */
function useFullscreen(): { on: boolean; own: boolean } {
  const [own, setOwn] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const onChange = () => setOwn(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const reported = useMediaQuery(FULLSCREEN_QUERY);
  return { on: own || reported, own };
}

interface Props {
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  /** The way of steering in use; its sensitivity is the one shown. */
  controls: Steering;
  /** A screen played with fingers: it has the choice between a finger and the tilt, and may vibrate. */
  touch: boolean;
  tiltOn: boolean;
  onToggleTilt: () => void;
}

/** The settings of the game as a run of buttons: in the menu of the jump screen and on a screen of their own. */
export function SettingsControls({ settings, onSettings, controls, touch, tiltOn, onToggleTilt }: Props) {
  const fullscreen = useFullscreen();
  const [fullscreenNote, setFullscreenNote] = useState(false);
  const sensitivity = sensitivityFor(settings.sensitivity, controls);
  const changeSensitivity = (by: -1 | 1) => {
    const level = stepSensitivity(sensitivity, by);
    if (level !== sensitivity) onSettings({ sensitivity: withSensitivity(settings.sensitivity, controls, level) });
  };
  const toggleFullscreen = () => {
    // A page can leave only the full screen it asked for itself.
    if (fullscreen.on && !fullscreen.own) {
      setFullscreenNote(true);
      return;
    }
    setFullscreenNote(false);
    const request = fullscreen.own ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    request.catch(() => undefined);
  };
  return (
    <>
      {touch && (
        <button type="button" className="pixel-button" aria-pressed={tiltOn} onClick={onToggleTilt}>
          {tiltOn ? "Pochylanie: przechył" : "Pochylanie: palec"}
        </button>
      )}
      <div className="stepper" role="group" aria-label="Czułość sterowania">
        <button
          type="button"
          className="pixel-button"
          aria-label="Mniejsza czułość"
          aria-disabled={sensitivity <= SENSITIVITY_MIN}
          onClick={() => changeSensitivity(-1)}
        >
          -
        </button>
        <span className="stepper-value" role="status">
          Czułość: {sensitivity}
        </span>
        <button
          type="button"
          className="pixel-button"
          aria-label="Większa czułość"
          aria-disabled={sensitivity >= SENSITIVITY_MAX}
          onClick={() => changeSensitivity(1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="pixel-button"
        onClick={() => onSettings({ scenery: NEXT_SCENERY[settings.scenery] })}
      >
        Sceneria: {SCENERY_LABEL[settings.scenery]}
      </button>
      <button
        type="button"
        className="pixel-button"
        aria-pressed={settings.sound}
        onClick={() => onSettings({ sound: !settings.sound })}
      >
        {settings.sound ? "Dźwięk: wł." : "Dźwięk: wył."}
      </button>
      <button
        type="button"
        className="pixel-button"
        aria-pressed={settings.hillHints}
        onClick={() => onSettings({ hillHints: !settings.hillHints })}
      >
        {settings.hillHints ? "Podpowiedzi na skoczni: wł." : "Podpowiedzi na skoczni: wył."}
      </button>
      {document.fullscreenEnabled && (
        <button type="button" className="pixel-button" aria-pressed={fullscreen.on} onClick={toggleFullscreen}>
          {fullscreen.on ? "Pełny ekran: wł." : "Pełny ekran: wył."}
        </button>
      )}
      {fullscreenNote && fullscreen.on && (
        <p className="note" role="status">
          {BROWSER_FULLSCREEN_NOTE}
        </p>
      )}
      {touch && canVibrate() && (
        <button
          type="button"
          className="pixel-button"
          aria-pressed={settings.vibration}
          onClick={() => onSettings({ vibration: !settings.vibration })}
        >
          {settings.vibration ? "Wibracje: wł." : "Wibracje: wył."}
        </button>
      )}
    </>
  );
}
