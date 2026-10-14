import { useMemo, useState } from "react";
import type { HillChoice } from "../game/hill-choice";
import { pickScenery } from "../game/scenery";
import { newSeed } from "../game/training-session";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { JumpMenu } from "./jump-menu";
import type { JumpResult } from "./jump-round";
import { TouchPad } from "./touch-pad";
import { useEntryFocus } from "./use-entry-focus";
import { useJumpLoop } from "./use-jump-loop";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";
import { usePauseMenu } from "./use-pause-menu";
import { useSoundEngine } from "./use-sound-engine";
import { useSteering } from "./use-steering";

interface Props {
  hill: HillChoice;
  record: HillRecord | undefined;
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  onFinished: (result: JumpResult) => void;
  /** The hills the menu offers, with their records, and what choosing one does. */
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPickHill: (hill: HillChoice) => void;
  /** Leaves the training for the main menu. */
  onExit: () => void;
  /** Whether the picture takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
  /** Whether the frames of the jump are measured and the measurements shown over the picture. */
  diagnostics: boolean;
}

const JUMP_TEXT = UI_TEXT.jumpScreen;

/** The training on one hill: the picture of the jump, the touch zones on a phone, and the menu. */
export function JumpScreen(props: Props) {
  const { hill, settings, onSettings } = props;
  const [announcement, setAnnouncement] = useState("");
  const touch = useMediaQuery(TOUCH_QUERY);
  const steering = useSteering(touch, settings, onSettings);
  const { controls, tiltOn } = steering;
  const { pausedRef, panelHeadingRef, pauseButtonRef, resumeButtonRef, ...menu } = usePauseMenu();
  const soundRef = useSoundEngine(settings.sound);
  // The look is drawn once per visit to the hill (not per jump), from its own seed.
  const [visitSeed] = useState(newSeed);
  const scenery = useMemo(() => pickScenery(settings.scenery, visitSeed), [settings.scenery, visitSeed]);
  const { stageRef, canvasRef, diagnosticsRef, restartRef } = useJumpLoop({
    hill,
    live: { onFinished: props.onFinished, record: props.record, settings, controls, scenery },
    inputRef: steering.inputRef,
    tiltRef: steering.tiltRef,
    resetHands: steering.resetHands,
    soundRef,
    pausedRef,
    pauseButtonRef,
    openMenu: menu.openMenu,
    toggleMenu: menu.toggleMenu,
    announce: setAnnouncement,
  });
  useEntryFocus(canvasRef, props.focusOnEntry);
  const pad = (side: "left" | "right") => (
    <TouchPad
      side={side}
      inert={menu.menuOpen}
      hints={tiltOn ? [] : JUMP_TEXT[side === "left" ? "leftPadHints" : "rightPadHints"]}
      label={tiltOn ? JUMP_TEXT[`${side}PadTilt`] : JUMP_TEXT[`${side}Pad`]}
      onPress={(down) => steering.pressZone(side, down)}
      onDrag={side === "left" ? steering.dragZone : () => undefined}
    />
  );

  return (
    <div
      className={`game${touch ? " touch" : ""}${controls === "tilt" ? " tilt" : ""}${controls === "touch" ? "" : " wide"}${menu.menuOpen ? " menu-open" : ""}`}
    >
      <button
        type="button"
        className="pause-button"
        aria-label={JUMP_TEXT.pause}
        aria-expanded={menu.menuOpen}
        inert={menu.menuOpen}
        ref={pauseButtonRef}
        onClick={menu.openMenu}
      >
        {touch ? (
          <svg viewBox="0 0 6 6" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
            <rect x="0" y="0" width="2" height="6" fill="currentColor" />
            <rect x="4" y="0" width="2" height="6" fill="currentColor" />
          </svg>
        ) : (
          // With the mouse captured, or in full screen, the key is the way out: it is what the button says.
          <span aria-hidden="true">{JUMP_TEXT.pauseKey}</span>
        )}
      </button>
      <div className="game-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          role="img"
          aria-label={JUMP_TEXT.canvas(UI_TEXT.hillLabel(hill.name, hill.kPointM))}
        />
        {props.diagnostics && <pre className="jump-diagnostics" aria-hidden="true" ref={diagnosticsRef} />}
      </div>
      <div className="game-toolbar">
        <JumpMenu
          panel={menu.panel}
          onPanel={menu.setPanel}
          headingRef={panelHeadingRef}
          menuOpen={menu.menuOpen}
          resumeRef={resumeButtonRef}
          touch={touch}
          controls={controls}
          hills={props.hills}
          records={props.records}
          onPickHill={(picked) => {
            // The hill being jumped starts again; another one replaces this screen.
            if (picked.id === hill.id) restartRef.current();
            menu.closeMenu();
            props.onPickHill(picked);
          }}
          onResume={menu.closeMenu}
          onAgain={() => {
            restartRef.current();
            menu.closeMenu();
          }}
          settings={settings}
          onSettings={onSettings}
          tiltOn={tiltOn}
          onToggleTilt={steering.toggleTilt}
          tiltNote={steering.tiltNote}
          onExit={props.onExit}
        />
      </div>
      {touch && pad("left")}
      {touch && pad("right")}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
