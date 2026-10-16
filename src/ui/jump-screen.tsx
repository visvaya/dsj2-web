import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { HillChoice } from "../game/hill-choice";
import { pickScenery } from "../game/scenery";
import { newSeed } from "../game/training-session";
import type { OfflineState } from "../pwa/offline-state";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { JumpMenu } from "./jump-menu";
import { ReplayBar } from "./replay-bar";
import { nextReplaySpeed, type JumpRecording, type ReplaySource, type ReplayView } from "./jump-replay";
import type { FinishedJump, JumpLoopControls } from "./jump-runs";
import type { KeepOutcome } from "./use-replay-shelf";
import type { JumpResult } from "./jump-round";
import { useNowPlaying } from "./now-playing";
import { TouchPad } from "./touch-pad";
import { useEntryFocus } from "./use-entry-focus";
import { useJumpLoop } from "./use-jump-loop";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";
import { usePauseMenu } from "./use-pause-menu";
import { ScreenNote } from "./screen-note";
import { useSoundEngine } from "./use-sound-engine";
import { useSteering } from "./use-steering";

interface Props {
  hill: HillChoice;
  record: HillRecord | undefined;
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  onFinished: (result: JumpResult, recording: JumpRecording) => void;
  /** The hills the menu offers, with their records, and what choosing one does. */
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPickHill: (hill: HillChoice) => void;
  /** Leaves the training for the main menu. */
  onExit: () => void;
  /** Leaves for the replay screen, to choose another replay of the original. */
  onOpenReplays: () => void;
  /** Whether the picture takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
  /** Whether the frames of the jump are measured and the measurements shown over the picture. */
  diagnostics: boolean;
  /** A replay of the original game to play as the screen opens; the training on the hill follows it. */
  openingReplay: ReplaySource | null;
  /** Keeps the last jump on the shelf of replays; says what became of it. */
  onKeepJump: (jump: FinishedJump) => KeepOutcome;
  /** The replay of the hill's record, run beside each training jump as a ghost; null for none. */
  recordGhost: ReplaySource | null;
  /** Whether a newer release waits, told in the menu next to the version. */
  offline: OfflineState | null;
}

/** What the player is told after asking to keep the last jump. */
const KEEP_NOTE: Readonly<Record<KeepOutcome, string>> = {
  kept: UI_TEXT.jumpScreen.replay.keptLast,
  notReady: UI_TEXT.replays.notReady,
  alreadyKept: UI_TEXT.jumpScreen.replay.alreadyKept,
  keptFull: UI_TEXT.replays.keptFull,
  loadedFull: UI_TEXT.replays.loadedFull,
  budgetFull: UI_TEXT.replays.budgetFull,
};

/** How long the note about a kept jump stays in the menu. */
const KEEP_NOTE_MS = 5000;

/**
 * The look of the hill, drawn once per visit (not per jump) from its own seed, and whether the player chose another
 * kind of look during the visit; until then a replay shows the look its jump had.
 */
function useVisitScenery(choice: Settings["scenery"], weather: Settings["weather"]) {
  const [visitSeed] = useState(newSeed);
  const [entry] = useState({ choice, weather });
  const scenery = useMemo(() => pickScenery(choice, visitSeed, weather), [choice, visitSeed, weather]);
  return { scenery, sceneryChosen: choice !== entry.choice || weather !== entry.weather };
}

/** Keeps the last jump that ended and leaves a note of what became of it, which goes away on its own. */
function useKeepLastJump(loop: JumpLoopControls, onKeepJump: Props["onKeepJump"]) {
  const [keepNote, setKeepNote] = useState("");
  useEffect(() => {
    if (keepNote === "") return undefined;
    const timer = setTimeout(() => setKeepNote(""), KEEP_NOTE_MS);
    return () => clearTimeout(timer);
  }, [keepNote]);
  const onKeepLast = () => {
    const jump = loop.lastJump();
    if (jump) setKeepNote(KEEP_NOTE[onKeepJump(jump)]);
  };
  return { keepNote, onKeepLast };
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

/** What became of a jump kept with the S key, over the picture; with the menu open the menu says it. */
function KeepNote({ text }: { text: string }) {
  return text === "" ? null : (
    <p className="keep-note" role="status">
      {text}
    </p>
  );
}

/** What the pause button shows: the sign of a pause, or with a mouse the key that opens the menu. */
function PauseSign({ touch }: { touch: boolean }) {
  return touch ? (
    <svg viewBox="0 0 6 6" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="2" height="6" fill="currentColor" />
      <rect x="4" y="0" width="2" height="6" fill="currentColor" />
    </svg>
  ) : (
    // With the mouse captured, or in full screen, the key is the way out: it is what the button says.
    <span aria-hidden="true">{JUMP_TEXT.pauseKey}</span>
  );
}

/**
 * The question about tilting stops the jump at once, before the player starts; once per visit, so after a "back"
 * it waits in the menu, above the buttons, until it is answered.
 */
function useAskAboutTilt(
  steering: { tiltQuestion: boolean; answerTiltQuestion: (yes: boolean) => void },
  jumping: boolean,
  menu: { menuOpen: boolean; openMenu: () => void },
) {
  const question = steering.tiltQuestion;
  const askedRef = useRef(false);
  const yesRef = useRef<HTMLButtonElement>(null);
  const { menuOpen, openMenu } = menu;
  useEffect(() => {
    if (!question || !jumping || askedRef.current) return;
    askedRef.current = true;
    openMenu();
  }, [question, jumping, openMenu]);
  // After the menu's own focus on its first button (an effect of the pause menu, which runs first).
  useEffect(() => {
    if (menuOpen && question && jumping) yesRef.current?.focus();
  }, [menuOpen, question, jumping]);
  return { tiltQuestion: question, onTiltAnswer: steering.answerTiltQuestion, tiltYesRef: yesRef };
}

/** The classes of the screen: how it is played, and what is over the picture or under it. */
function gameClass(c: { touch: boolean; controls: string; menuOpen: boolean; replaying: boolean; bar: boolean }) {
  const classes = [
    "game",
    c.touch && "touch",
    c.controls === "tilt" && "tilt",
    c.controls !== "touch" && "wide",
    c.menuOpen && "menu-open",
    c.replaying && "replaying",
    c.bar && "with-bar",
  ];
  return classes.filter(Boolean).join(" ");
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
  const look = useVisitScenery(settings.scenery, settings.weather);
  const ghost = props.recordGhost;
  const {
    stageRef,
    canvasRef,
    diagnosticsRef,
    controls: loop,
  } = useJumpLoop({
    hill,
    live: { onFinished: props.onFinished, record: props.record, settings, controls, ...look, replay, ghost },
    inputRef: steering.inputRef,
    tiltRef: steering.tiltRef,
    resetHands: steering.resetHands,
    soundRef,
    pausedRef,
    pauseButtonRef,
    openMenu: menu.openMenu,
    toggleMenu: menu.toggleMenu,
    // The S key; called only after this render, once the handler below exists.
    keepLast: () => keepLast.onKeepLast(),
    announce: setAnnouncement,
    onReplayAvailable: setReplayAvailable,
    onReplayChange: setReplay,
    initialReplay: props.openingReplay,
  });
  useEntryFocus(canvasRef, props.focusOnEntry);
  useNowPlaying(UI_TEXT.hillLabel(hill.name, hill.kPointM));
  const keepLast = useKeepLastJump(loop, props.onKeepJump);
  const bar = replay !== null && settings.replays.slider;
  const tiltAsk = useAskAboutTilt(steering, replay === null, menu);
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
    <div className={gameClass({ touch, controls, menuOpen: menu.menuOpen, replaying: replay !== null, bar })}>
      <button
        type="button"
        className="pause-button"
        aria-label={JUMP_TEXT.pause}
        aria-expanded={menu.menuOpen}
        inert={menu.menuOpen}
        ref={pauseButtonRef}
        onClick={menu.openMenu}
      >
        <PauseSign touch={touch} />
      </button>
      <div className="game-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          role="img"
          aria-label={JUMP_TEXT.canvas(UI_TEXT.hillLabel(hill.name, hill.kPointM))}
        />
        {!menu.menuOpen && <KeepNote text={keepLast.keepNote} />}
        {props.diagnostics && <pre className="jump-diagnostics" aria-hidden="true" ref={diagnosticsRef} />}
      </div>
      {bar && <ReplayBar position={loop.replayPosition} onSeek={loop.seekReplay} />}
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
            if (picked.id === hill.id) loop.restart();
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
          {...keepLast}
          settings={settings}
          onSettings={onSettings}
          tiltOn={tiltOn}
          onToggleTilt={steering.toggleTilt}
          tiltNote={steering.tiltNote}
          {...tiltAsk}
          onExit={props.onExit}
          offline={props.offline}
          onOtherReplay={props.onOpenReplays}
        />
      </div>
      {touch && pad("left")}
      {touch && pad("right")}
      <ScreenNote touch={touch} jumping={replay === null} tiltNote={steering.tiltNote} hidden={menu.menuOpen} />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
