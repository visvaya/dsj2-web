import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { HillChoice } from "../game/hill-choice";
import {
  REPLAY_LIMITS,
  entryBytes,
  oldestRemovable,
  shelfBytes,
  sameReplay,
  withKept,
  withoutEntries,
  type Shelf,
  type ShelfEntry,
  type ShelfKind,
} from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";
import type { ReplaySource } from "./jump-replay";
import { originalReplayOutcome } from "./original-replay-choice";
import { entryPlaysTrue, sourceOfEntry } from "./shelf-replays";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.replays;
const BYTES_PER_KB = 1000;
const GROUPS: readonly ShelfKind[] = ["record", "kept", "recent"];
/** How long a first press of "remove" waits for the second. */
const CONFIRM_MS = 5000;
/** How many of the oldest replays the clean-up offers to remove at first. */
const REMOVE_OLDEST_DEFAULT = 10;

interface Props {
  shelf: Shelf;
  /** Every hill of the game; a replay plays on the hill it was jumped on. */
  hills: readonly HillChoice[];
  /** The hills read from the player's Dsj.exe; a replay of the original plays on one of them. */
  originalHills: readonly HillChoice[];
  onPlay: (hill: HillChoice, source: ReplaySource) => void;
  onChangeShelf: (change: (current: Shelf) => Shelf) => void;
  /** Where the replays are kept: "memory" means only until the page closes. */
  storeName: string;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

const kb = (bytes: number): string => T.sizeKb((bytes / BYTES_PER_KB).toFixed(1));

/** The line under a replay's hill: its result, its date and what it weighs. */
function rowText(entry: ShelfEntry): string {
  const { distanceM, points, fell } = entry.result;
  const distance = fell ? `${distanceM.toFixed(2)} (${T.fell})` : distanceM.toFixed(2);
  const date = new Date(entry.dateIso).toLocaleDateString("pl-PL");
  return T.row(distance, points.toFixed(1), date, kb(entryBytes(entry)));
}

interface RowProps {
  entry: ShelfEntry;
  confirming: boolean;
  onWatch: () => void;
  onKeep: (() => void) | null;
  onRemove: () => void;
}

function ReplayRow({ entry, confirming, onWatch, onKeep, onRemove }: RowProps) {
  const name = UI_TEXT.hillLabel(entry.hill.name, entry.hill.kPointM);
  const jumper = entry.replay.kind === "original" ? entry.replay.jumperName : undefined;
  return (
    <li className="replay-row">
      <span className="replay-row-hill">{jumper === undefined ? name : `${name} · ${jumper}`}</span>
      <span className="replay-row-detail">{rowText(entry)}</span>
      <span className="replay-row-actions">
        <button type="button" className="pixel-button small-button" onClick={onWatch}>
          {T.watch}
        </button>
        {onKeep && (
          <button type="button" className="pixel-button small-button" onClick={onKeep}>
            {T.keep}
          </button>
        )}
        <button type="button" className="pixel-button small-button" onClick={onRemove}>
          {confirming ? T.confirmRemove : T.remove}
        </button>
      </span>
    </li>
  );
}

/** Frees room in one go: the oldest replays that are not hill records. */
function RemoveOldest({ onRemove }: { onRemove: (count: number) => void }) {
  // Kept as typed, so the field can be cleared to type another number; read as a count on the press.
  const [typed, setTyped] = useState(String(REMOVE_OLDEST_DEFAULT));
  const count = Math.max(1, Math.trunc(Number(typed)) || REMOVE_OLDEST_DEFAULT);
  return (
    <div className="replay-remove-oldest">
      <label>
        {T.removeOldestCount}
        <input
          type="number"
          min={1}
          max={REPLAY_LIMITS.KEPT_MAX_COUNT + REPLAY_LIMITS.RECENT_MAX_COUNT}
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
        />
      </label>
      <button type="button" className="pixel-button small-button" onClick={() => onRemove(count)}>
        {T.removeOldest}
      </button>
    </div>
  );
}

/** The replays: hill records, kept and last jumps, each to watch, keep or remove; and files of the original. */
export function ReplaysScreen(props: Props) {
  const { shelf, hills, originalHills, onPlay, onChangeShelf, onBack, focusOnEntry, storeName } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // A removal asked for and not confirmed is forgotten after a while.
  useEffect(() => {
    if (confirming === null) return undefined;
    const timer = setTimeout(() => setConfirming(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const watch = (entry: ShelfEntry) => {
    const hill = hills.find((h) => h.id === entry.hill.id);
    if (!hill) return setMessage({ text: T.hillMissing, error: true });
    const source = sourceOfEntry(entry);
    if (!source || !entryPlaysTrue(entry, source, hill)) return setMessage({ text: T.notTrue, error: true });
    // Opened here, the replay leads back here.
    return onPlay(hill, { ...source, origin: "original" });
  };
  const keep = (entry: ShelfEntry) => {
    setConfirming(null);
    const copy = { ...entry, id: `kept:${entry.id}` };
    const outcome = withKept(shelf, copy);
    if (outcome.refused === null) onChangeShelf((current) => withKept(current, copy).shelf);
    setMessage(
      outcome.refused === null ? { text: T.keptDone, error: false } : { text: T[outcome.refused], error: true },
    );
  };
  const remove = (entry: ShelfEntry) => {
    if (confirming !== entry.id) {
      setConfirming(entry.id);
      return setMessage({ text: T.removeArmed, error: false });
    }
    setConfirming(null);
    setMessage(null);
    return onChangeShelf((current) => withoutEntries(current, new Set([entry.id])));
  };
  const removeOldest = (count: number) => {
    const ids = oldestRemovable(shelf, count);
    onChangeShelf((current) => withoutEntries(current, ids));
    setMessage({ text: T.removed(ids.size), error: false });
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const outcome = originalReplayOutcome(new Uint8Array(await file.arrayBuffer()), originalHills);
    // The same file chosen again must still raise a change.
    input.value = "";
    if (outcome.ok) onPlay(outcome.hill, outcome.source);
    else setMessage({ text: outcome.message, error: true });
  };
  const kept = shelf.filter((e) => e.kind === "kept");

  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.title}
      </h1>
      <p className="note">{T.intro}</p>
      {shelf.length === 0 && <p className="note">{T.empty}</p>}
      {GROUPS.map((kind) => {
        const entries = shelf.filter((e) => e.kind === kind).toReversed();
        if (entries.length === 0) return null;
        return (
          <section key={kind} className="replay-group" aria-label={T.groups[kind]}>
            <h2 className="hill-section-title">{T.groups[kind]}</h2>
            <ul className="replay-list">
              {entries.map((entry) => (
                <ReplayRow
                  key={entry.id}
                  entry={entry}
                  confirming={confirming === entry.id}
                  onWatch={() => watch(entry)}
                  onKeep={kind === "kept" || kept.some((k) => sameReplay(k, entry)) ? null : () => keep(entry)}
                  onRemove={() => remove(entry)}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {shelf.length > 0 && (
        <>
          <p className="note">{T.usage(shelf.length, kb(shelfBytes(shelf)), kb(REPLAY_LIMITS.BUDGET_BYTES))}</p>
          <RemoveOldest onRemove={removeOldest} />
        </>
      )}
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
      {storeName === "memory" && <p className="note error">{T.onlyForVisit}</p>}
      {/* Always there, so a screen reader hears each message as it changes. */}
      <p className={message?.error === true ? "note error" : "note"} role="status">
        {message?.text ?? ""}
      </p>
    </main>
  );
}
