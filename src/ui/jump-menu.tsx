import type { RefObject } from "react";
import type { HillChoice } from "../game/hill-choice";
import { versionLabel } from "../game/version";
import type { ControlScheme } from "../render/jump-view";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { HillLists } from "./hill-screen";
import { HowToJump } from "./how-to-jump";
import { SettingsControls } from "./settings-controls";
import { REPLAY_SPEED_LABEL, type ReplayView } from "./jump-replay";
import type { MenuPanel } from "./use-pause-menu";

const JUMP_TEXT = UI_TEXT.jumpScreen;

interface Props {
  panel: MenuPanel;
  onPanel: (panel: MenuPanel) => void;
  /** Takes the focus when the instructions or the list of hills replace the buttons. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  menuOpen: boolean;
  resumeRef: RefObject<HTMLButtonElement | null>;
  touch: boolean;
  controls: ControlScheme;
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPickHill: (hill: HillChoice) => void;
  onResume: () => void;
  onAgain: () => void;
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  tiltOn: boolean;
  onToggleTilt: () => void;
  /** A note about the motion sensor, or nothing. */
  tiltNote: string;
  onExit: () => void;
  /** How the replay is being watched; null while jumping. */
  replay: ReplayView | null;
  /** Whether a finished jump can be watched again. */
  replayAvailable: boolean;
  onWatchReplay: () => void;
  /** Moves the replay to its next tempo. */
  onReplaySpeed: () => void;
  onReplayFromStart: () => void;
  onReplayEnd: () => void;
}

const REPLAY_TEXT = JUMP_TEXT.replay;

/** In a replay the menu holds what the replay needs: its tempo, its start, and the way back to jumping. */
function ReplayButtons({ replay, onReplaySpeed, onReplayFromStart, onReplayEnd }: ReplayButtonsProps) {
  return (
    <>
      <button type="button" className="pixel-button" onClick={onReplaySpeed}>
        {REPLAY_TEXT.speed(REPLAY_SPEED_LABEL[replay.speed])}
      </button>
      <button type="button" className="pixel-button" onClick={onReplayFromStart}>
        {REPLAY_TEXT.fromStart}
        {JUMP_TEXT.againKey}
      </button>
      <button type="button" className="pixel-button" onClick={onReplayEnd}>
        {REPLAY_TEXT.end}
      </button>
    </>
  );
}

type ReplayButtonsProps = Pick<Props, "onReplaySpeed" | "onReplayFromStart" | "onReplayEnd"> & { replay: ReplayView };

/** The buttons of the jump screen; in the open menu, the instructions or the list of hills can take their place. */
export function JumpMenu({ headingRef, resumeRef, ...p }: Props) {
  if (p.panel !== "menu") {
    return (
      <>
        <h2 className="how-to-title" tabIndex={-1} ref={headingRef}>
          {p.panel === "help" ? UI_TEXT.howTo.title : UI_TEXT.hills.title}
        </h2>
        {p.panel === "help" ? (
          <HowToJump steering={p.controls} />
        ) : (
          <div className="menu-hills">
            <HillLists hills={p.hills} records={p.records} onPick={p.onPickHill} />
          </div>
        )}
        <button type="button" className="pixel-button" onClick={() => p.onPanel("menu")}>
          {UI_TEXT.back}
        </button>
      </>
    );
  }
  return (
    <>
      {p.menuOpen && (
        <button type="button" className="pixel-button resume-button" ref={resumeRef} onClick={p.onResume}>
          {JUMP_TEXT.resume}
          {p.touch ? "" : JUMP_TEXT.resumeKey}
        </button>
      )}
      {p.replay ? (
        <ReplayButtons
          replay={p.replay}
          onReplaySpeed={p.onReplaySpeed}
          onReplayFromStart={p.onReplayFromStart}
          onReplayEnd={p.onReplayEnd}
        />
      ) : (
        <>
          <button type="button" className="pixel-button" onClick={p.onAgain}>
            {JUMP_TEXT.again}
            {p.touch ? "" : JUMP_TEXT.againKey}
          </button>
          {/* Unavailable rather than disabled, so the keyboard and a screen reader still find it. */}
          <button
            type="button"
            className="pixel-button"
            aria-disabled={!p.replayAvailable}
            onClick={p.replayAvailable ? p.onWatchReplay : undefined}
          >
            {REPLAY_TEXT.watch}
          </button>
        </>
      )}
      <button type="button" className="pixel-button" onClick={() => p.onPanel("help")}>
        {UI_TEXT.menu.howTo}
      </button>
      <button type="button" className="pixel-button" onClick={() => p.onPanel("hills")}>
        {JUMP_TEXT.changeHill}
      </button>
      <SettingsControls
        settings={p.settings}
        onSettings={p.onSettings}
        controls={p.controls}
        touch={p.touch}
        tiltOn={p.tiltOn}
        onToggleTilt={p.onToggleTilt}
      />
      <button type="button" className="pixel-button" onClick={p.onExit}>
        {JUMP_TEXT.exit}
      </button>
      {p.tiltNote !== "" && (
        <p className="note error" role="status">
          {p.tiltNote}
        </p>
      )}
      <p className="note version-note">{versionLabel()}</p>
    </>
  );
}
