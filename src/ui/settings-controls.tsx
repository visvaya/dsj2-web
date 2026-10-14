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
import { UI_TEXT } from "../text/ui-text";
import type { Steering } from "./how-to-jump-text";
import { useMediaQuery } from "./use-media-query";

const NEXT_SCENERY: Readonly<Record<SceneryChoice, SceneryChoice>> = {
  varied: "day",
  day: "dusk",
  dusk: "night",
  night: "varied",
};
const T = UI_TEXT.settings;
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
  /** Whether the settings of the steering (finger or tilt, sensitivity, vibration) are shown; not in a replay. */
  steering?: boolean;
  tiltOn: boolean;
  onToggleTilt: () => void;
}

/** The settings of the game as a run of buttons: in the menu of the jump screen and on a screen of their own. */
export function SettingsControls({
  settings,
  onSettings,
  controls,
  touch,
  steering = true,
  tiltOn,
  onToggleTilt,
}: Props) {
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
      {steering && touch && (
        <button type="button" className="pixel-button" aria-pressed={tiltOn} onClick={onToggleTilt}>
          {tiltOn ? T.leanTilt : T.leanFinger}
        </button>
      )}
      {steering && (
        <div className="stepper" role="group" aria-label={T.sensitivityGroup}>
          <button
            type="button"
            className="pixel-button"
            aria-label={T.sensitivityDown}
            aria-disabled={sensitivity <= SENSITIVITY_MIN}
            onClick={() => changeSensitivity(-1)}
          >
            -
          </button>
          <span className="stepper-value" role="status">
            {T.sensitivity}
            {sensitivity}
          </span>
          <button
            type="button"
            className="pixel-button"
            aria-label={T.sensitivityUp}
            aria-disabled={sensitivity >= SENSITIVITY_MAX}
            onClick={() => changeSensitivity(1)}
          >
            +
          </button>
        </div>
      )}
      <button
        type="button"
        className="pixel-button"
        onClick={() => onSettings({ scenery: NEXT_SCENERY[settings.scenery] })}
      >
        {T.scenery}
        {T.sceneryName[settings.scenery]}
      </button>
      <button
        type="button"
        className="pixel-button"
        aria-pressed={settings.sound}
        onClick={() => onSettings({ sound: !settings.sound })}
      >
        {settings.sound ? T.soundOn : T.soundOff}
      </button>
      <button
        type="button"
        className="pixel-button"
        aria-pressed={settings.hillHints}
        onClick={() => onSettings({ hillHints: !settings.hillHints })}
      >
        {settings.hillHints ? T.hintsOn : T.hintsOff}
      </button>
      {document.fullscreenEnabled && (
        <button type="button" className="pixel-button" aria-pressed={fullscreen.on} onClick={toggleFullscreen}>
          {fullscreen.on ? T.fullscreenOn : T.fullscreenOff}
        </button>
      )}
      {fullscreenNote && fullscreen.on && (
        <p className="note" role="status">
          {T.browserFullscreen}
        </p>
      )}
      {steering && touch && canVibrate() && (
        <button
          type="button"
          className="pixel-button"
          aria-pressed={settings.vibration}
          onClick={() => onSettings({ vibration: !settings.vibration })}
        >
          {settings.vibration ? T.vibrationOn : T.vibrationOff}
        </button>
      )}
    </>
  );
}
