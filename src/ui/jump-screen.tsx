import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { HillChoice } from "../game/hill-choice";
import { pickScenery } from "../game/scenery";
import { newSeed } from "../game/training-session";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { JumpMenu } from "./jump-menu";
import { nextReplaySpeed, type ReplayView } from "./jump-replay";
import type { JumpLoopControls } from "./jump-runs";
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

/** What the replay buttons of the menu do; each closes the menu, apart from the tempo. */
function replayHandlers(
  loop: JumpLoopControls,
  closeMenu: () => void,
  setReplay: Dispatch<SetStateAction<ReplayView | null>>,
) {
  const thenClose = (act: (c: JumpLoopControls) => void) => () => {
    act(loop);
    closeMenu();
  };
  return {
    onWatchReplay: thenClose((c) => c.watchReplay()),
    onReplaySpeed: () => setReplay((view) => view && { ...view, speed: nextReplaySpeed(view.speed) }),
    onReplayFromStart: thenClose((c) => c.restart()),
    onReplayEnd: thenClose((c) => c.endReplay()),
  };
}

/** The training on one hill: the picture of the jump, the touch zones on a phone, and the menu. */
export function JumpScreen(props: Props) {
  const { hill, settings, onSettings } = props;
  const [announcement, setAnnouncement] = useState("");
  /** How the replay is being watched; null while jumping. */
  const [replay, setReplay] = useState<ReplayView | null>(null);
  const [replayAvailable, setReplayAvailable] = useState(false);
  const touch = useMediaQuery(TOUCH_QUERY);
  const steering = useSteering(touch, settings, onSettings);
  const { controls, tiltOn } = steering;
  const { pausedRef, panelHeadingRef, pauseButtonRef, resumeButtonRef, ...menu } = usePauseMenu();
  const soundRef = useSoundEngine(settings.sound);
  // The look is drawn once per visit to the hill (not per jump), from its own seed.
  const [visitSeed] = useState(newSeed);
  const scenery = useMemo(() => pickScenery(settings.scenery, visitSeed), [settings.scenery, visitSeed]);
  const {
    stageRef,
    canvasRef,
    diagnosticsRef,
    controls: loop,
  } = useJumpLoop({
    hill,
    live: { onFinished: props.onFinished, record: props.record, settings, controls, scenery, replay },
    inputRef: steering.inputRef,
    tiltRef: steering.tiltRef,
    resetHands: steering.resetHands,
    soundRef,
    pausedRef,
    pauseButtonRef,
    openMenu: menu.openMenu,
    toggleMenu: menu.toggleMenu,
    announce: setAnnouncement,
    onReplayAvailable: setReplayAvailable,
    onReplayChange: setReplay,
  });
  useEntryFocus(canvasRef, props.focusOnEntry);
  const pad = (side: "left" | "right") => (
    <TouchPad
      side={side}
      inert={menu.menuOpen || replay !== null}
      // A replay takes no hands: the zones keep their place, so the picture does not move, and a touch goes
      // through to the picture, which pauses the replay.
      idle={replay !== null}
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
            if (picked.id === hill.id) {
              if (replay) loop.endReplay();
              else loop.restart();
            }
            menu.closeMenu();
            props.onPickHill(picked);
          }}
          onResume={menu.closeMenu}
          onAgain={() => {
            loop.restart();
            menu.closeMenu();
          }}
          replay={replay}
          replayAvailable={replayAvailable}
          {...replayHandlers(loop, menu.closeMenu, setReplay)}
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
