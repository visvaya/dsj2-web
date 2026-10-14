import { useRef, useState, type ChangeEvent } from "react";
import type { HillChoice } from "../game/hill-choice";
import { UI_TEXT } from "../text/ui-text";
import type { ReplaySource } from "./jump-replay";
import { originalReplayOutcome } from "./original-replay-choice";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.replays;

interface Props {
  /** The hills read from the player's Dsj.exe; a replay of the original plays on one of them. */
  originalHills: readonly HillChoice[];
  onPlay: (hill: HillChoice, source: ReplaySource) => void;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** Replays of the original game, chosen as files from the player's disk and played on the hills of Dsj.exe. */
export function ReplaysScreen({ originalHills, onPlay, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [error, setError] = useState("");

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const outcome = originalReplayOutcome(new Uint8Array(await file.arrayBuffer()), originalHills);
    // The same file chosen again must still raise a change.
    input.value = "";
    if (outcome.ok) onPlay(outcome.hill, outcome.source);
    else setError(outcome.message);
  };

  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.title}
      </h1>
      <p className="note">{T.intro}</p>
      {originalHills.length === 0 && <p className="note">{T.needsGame}</p>}
      <div className="menu">
        <label className="pixel-button file-label">
          {T.load}
          {/* No accept filter: a phone may not know .rpl and grey such files out. The file is checked instead. */}
          <input type="file" onChange={(e) => void onFile(e)} />
        </label>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
      {error !== "" && (
        <p className="note error" role="status">
          {error}
        </p>
      )}
    </main>
  );
}
