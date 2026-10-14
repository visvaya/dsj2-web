import type { RefObject } from "react";
import type { HillChoice } from "../game/hill-choice";
import { versionLabel } from "../game/version";
import type { ControlScheme } from "../render/jump-view";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { HillLists } from "./hill-screen";
import { HowToJump } from "./how-to-jump";
import { SettingsControls } from "./settings-controls";
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
}

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
      <button type="button" className="pixel-button" onClick={p.onAgain}>
        {JUMP_TEXT.again}
        {p.touch ? "" : JUMP_TEXT.againKey}
      </button>
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
