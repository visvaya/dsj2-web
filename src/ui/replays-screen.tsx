import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { HillChoice } from "../game/hill-choice";
import { readReplayFile, replayFileName, replayFileText } from "../storage/replay-file";
import {
  REPLAY_LIMITS,
  oldestRemovable,
  shelfBytes,
  withKept,
  withoutEntries,
  type Shelf,
  type ShelfEntry,
} from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";
import { handOverFile } from "./hand-over-file";
import type { ReplaySource } from "./jump-replay";
import { originalReplayOutcome } from "./original-replay-choice";
import { kb, ReplayList } from "./replay-list";
import { importedShelf, originalEntry } from "./replay-import";
import { entryPlaysTrue, sourceOfEntry } from "./shelf-replays";
import { useEntryFocus } from "./use-entry-focus";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";

const T = UI_TEXT.replays;
/** How long a first press of "remove" waits for the second. */
const CONFIRM_MS = 5000;
/** How many of the oldest replays the clean-up offers to remove at first. */
const REMOVE_OLDEST_DEFAULT = 10;
/** The removal of the selected replays, as it waits for its second press. */
const SELECTED = "selected";

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

type Message = { text: string; error: boolean } | null;

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

/** A removal asked for once and confirmed by a second press, forgotten after a while. */
function useConfirm() {
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    if (confirming === null) return undefined;
    const timer = setTimeout(() => setConfirming(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);
  /** True on the second press for `key`; the first only arms it. */
  const confirmed = (key: string): boolean => {
    if (confirming === key) {
      setConfirming(null);
      return true;
    }
    setConfirming(key);
    return false;
  };
  return { confirming, confirmed, disarm: () => setConfirming(null) };
}

/** What the replay screen does with the replays and with a chosen file. */
function useReplayActions(p: Props, setMessage: (message: Message) => void) {
  const { shelf, hills, originalHills, onPlay, onChangeShelf } = p;
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const confirm = useConfirm();
  const preferShare = useMediaQuery(TOUCH_QUERY);
  const fail = (text: string) => setMessage({ text, error: true });
  const remove = (ids: ReadonlySet<string>) => {
    onChangeShelf((current) => withoutEntries(current, ids));
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
  };
  const chosen = shelf.filter((e) => selected.has(e.id));
  return {
    selected,
    chosen,
    confirming: confirm.confirming,
    toggle: (entry: ShelfEntry) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(entry.id)) next.add(entry.id);
        return next;
      }),
    selectAll: () => setSelected(new Set(shelf.map((e) => e.id))),
    watch: (entry: ShelfEntry) => {
      const hill = hills.find((h) => h.id === entry.hill.id);
      if (!hill) return fail(T.hillMissing);
      const source = sourceOfEntry(entry);
      if (!source || !entryPlaysTrue(entry, source, hill)) return fail(T.notTrue);
      // Opened here, the replay leads back here.
      return onPlay(hill, { ...source, origin: "original" });
    },
    keep: (entry: ShelfEntry) => {
      confirm.disarm();
      const copy = { ...entry, id: `kept:${entry.id}` };
      const outcome = withKept(shelf, copy);
      if (outcome.refused !== null) return fail(T[outcome.refused]);
      onChangeShelf((current) => withKept(current, copy).shelf);
      return setMessage({ text: T.keptDone, error: false });
    },
    removeOne: (entry: ShelfEntry) => {
      if (!confirm.confirmed(entry.id)) return setMessage({ text: T.removeArmed, error: false });
      setMessage(null);
      return remove(new Set([entry.id]));
    },
    removeSelected: () => {
      if (!confirm.confirmed(SELECTED)) return setMessage({ text: T.removeArmed, error: false });
      setMessage(null);
      return remove(new Set(chosen.map((e) => e.id)));
    },
    removeOldest: (count: number) => {
      const ids = oldestRemovable(shelf, count);
      remove(ids);
      setMessage({ text: T.removed(ids.size), error: false });
    },
    exportSelected: async () => {
      const now = new Date();
      const file = new File([replayFileText(chosen, now)], replayFileName(now), { type: "application/json" });
      const outcome = await handOverFile(file, T.exportTitle, preferShare);
      setMessage(outcome === "cancelled" ? null : { text: T.exported[outcome], error: false });
    },
    readFile: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const replays = readReplayFile(new TextDecoder().decode(bytes));
      if (replays) {
        const outcome = importedShelf(shelf, replays.entries, new Date());
        onChangeShelf((current) => importedShelf(current, replays.entries, new Date()).shelf);
        const lines = [T.imported(outcome.added, outcome.alreadyKept)];
        if (replays.unreadable > 0) lines.push(T.importUnreadable(replays.unreadable));
        if (outcome.refused !== null) lines.push(T[outcome.refused]);
        return setMessage({ text: lines.join(" "), error: outcome.refused !== null || replays.unreadable > 0 });
      }
      const original = originalReplayOutcome(bytes, originalHills);
      if (!original.ok) return fail(original.message === T.notReplay ? T.notReplayFile : original.message);
      const entry = originalEntry(original.hill, bytes, original.source, new Date());
      if (entry) onChangeShelf((current) => withKept(current, entry).shelf);
      return onPlay(original.hill, original.source);
    },
  };
}

/** The replays: hill records, kept and last jumps, to watch, keep, export or remove; and files to read. */
export function ReplaysScreen(props: Props) {
  const { shelf, originalHills, storeName, onBack, focusOnEntry } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [message, setMessage] = useState<Message>(null);
  const a = useReplayActions(props, setMessage);
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // The same file chosen again must still raise a change.
    input.value = "";
    if (file) void a.readFile(file);
  };

  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.title}
      </h1>
      <p className="note">{T.intro}</p>
      {shelf.length === 0 && <p className="note">{T.empty}</p>}
      <ReplayList
        shelf={shelf}
        selected={a.selected}
        confirming={a.confirming}
        onToggle={a.toggle}
        onWatch={a.watch}
        onKeep={a.keep}
        onRemove={a.removeOne}
      />
      {shelf.length > 0 && (
        <div className="replay-row-actions">
          <button type="button" className="pixel-button small-button" onClick={a.selectAll}>
            {T.selectAll}
          </button>
          <button
            type="button"
            className="pixel-button small-button"
            aria-disabled={a.chosen.length === 0}
            onClick={a.chosen.length === 0 ? undefined : () => void a.exportSelected()}
          >
            {T.exportSelected(a.chosen.length)}
          </button>
          <button
            type="button"
            className="pixel-button small-button"
            aria-disabled={a.chosen.length === 0}
            onClick={a.chosen.length === 0 ? undefined : a.removeSelected}
          >
            {a.confirming === SELECTED ? T.confirmRemoveSelected(a.chosen.length) : T.removeSelected(a.chosen.length)}
          </button>
        </div>
      )}
      {shelf.length > 0 && (
        <>
          <p className="note">{T.usage(shelf.length, kb(shelfBytes(shelf)), kb(REPLAY_LIMITS.BUDGET_BYTES))}</p>
          <RemoveOldest onRemove={a.removeOldest} />
        </>
      )}
      {originalHills.length === 0 && <p className="note">{T.needsGame}</p>}
      <div className="menu">
        <label className="pixel-button file-label">
          {T.load}
          {/* No accept filter: a phone may not know .rpl and grey such files out. The file is checked instead. */}
          <input type="file" onChange={onFile} />
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
