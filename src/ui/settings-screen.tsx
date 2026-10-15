import { useRef, useState } from "react";
import { requestTiltPermission } from "../game/tilt-input";
import type { Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import type { Steering } from "./how-to-jump-text";
import { RecordGhostToggle } from "./replay-settings";
import { SettingsControls } from "./settings-controls";
import { useEntryFocus } from "./use-entry-focus";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";

interface Props {
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** The settings of the game on a screen of their own, opened from the main menu. */
export function SettingsScreen({ settings, onSettings, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const touch = useMediaQuery(TOUCH_QUERY);
  const tiltOn = settings.leanControl === "tilt";
  const controls: Steering = touch ? (tiltOn ? "tilt" : "touch") : "mouse";
  const [tiltRefused, setTiltRefused] = useState(false);
  const toggleTilt = () => {
    if (tiltOn) {
      onSettings({ leanControl: "drag" });
      return;
    }
    // The browser has to hand out the motion sensor; on an iPhone it asks the player.
    void requestTiltPermission().then((granted) => {
      setTiltRefused(!granted);
      if (granted) onSettings({ leanControl: "tilt" });
    });
  };
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.settings.title}
      </h1>
      <div className="settings-list">
        <SettingsControls
          settings={settings}
          onSettings={onSettings}
          controls={controls}
          touch={touch}
          tiltOn={tiltOn}
          onToggleTilt={toggleTilt}
        />
        <RecordGhostToggle recordGhost={settings.recordGhost} onSettings={onSettings} />
        {tiltRefused && (
          <p className="note error" role="status">
            {UI_TEXT.settings.tiltRefused}
          </p>
        )}
      </div>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
