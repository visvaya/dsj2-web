import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { HillChoice } from "../game/hill-choice";
import { REPLAY_FILE_MAX_BYTES } from "../storage/replay-file";
import {
  REPLAY_LIMITS,
  oldestRemovable,
  shelfBytes,
  withKept,
  withLoaded,
  withoutEntries,
  type Shelf,
  type ShelfEntry,
} from "../storage/replay-shelf";
import type { Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { typeset } from "./typeset";
import { handOverFile } from "./hand-over-file";
import { handOverManyRpl, handOverRpl, type Say } from "./rpl-handover";
import type { ReplaySource } from "./jump-replay";
import { formatSize } from "./number-text";
import { exportedReplaysFile, readChosenFile } from "./replay-files";
import { FramedNote, ReplayList } from "./replay-list";
import { ReplaySettingsControls } from "./replay-settings";
import { checkAgainst, importedShelf } from "./replay-import";
import { RPL_EXPORT_OFFERED, rplExportable } from "./rpl-export";
import { missingHillNote } from "./replay-hill";
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
  /** The player's settings: what is kept of the replays, what goes on its own, the slider of a replay. */
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  /** Where the replays are kept: "memory" means only until the page closes. */
  storeName: string;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/**
 * What the screen tells the player, and next to what: a replay's id, the selected ones, the clean-up or the file
 * that was read. It shows there, where the press was; a screen reader hears it from one place for all.
 */
type Message = { text: string; error: boolean; at: string } | null;
const AT_SELECTION = "selection";
const AT_CLEANUP = "cleanup";
const AT_FILE = "file";

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
          max={REPLAY_LIMITS.KEPT_MAX_COUNT + REPLAY_LIMITS.RECENT_MAX_COUNT + REPLAY_LIMITS.LOADED_MAX_COUNT}
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
  /** A check of a .rpl file is running; another press waits for it. */
  const checking = useRef(false);
  const sayAt =
    (at: string): Say =>
    (text, error = false) =>
      setMessage(text === "" ? null : { text, error, at });
  /** A long check of .rpl files, one at a time; a failure of the game's own is told, not left unsaid. */
  const checkRpl = async (at: string, run: (say: Say) => Promise<void>) => {
    if (checking.current) return;
    checking.current = true;
    try {
      await run(sayAt(at));
    } catch {
      sayAt(at)(T.notTrue, true);
    } finally {
      checking.current = false;
    }
  };
  const remove = (ids: ReadonlySet<string>) => {
    onChangeShelf((current) => withoutEntries(current, ids));
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
  };
  const chosen = shelf.filter((e) => selected.has(e.id));
  const selectedKey = `${SELECTED}:${chosen.map((e) => e.id).join(",")}`;
  return {
    selected,
    chosen,
    confirming: confirm.confirming,
    selectedArmed: confirm.confirming === selectedKey,
    toggle: (entry: ShelfEntry) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(entry.id)) next.add(entry.id);
        return next;
      }),
    allSelected: shelf.every((e) => selected.has(e.id)),
    selectAll: () => setSelected(new Set(shelf.map((e) => e.id))),
    selectNone: () => setSelected(new Set()),
    watch: (entry: ShelfEntry) => {
      const hill = hills.find((h) => h.id === entry.hill.id);
      if (!hill) return sayAt(entry.id)(missingHillNote(entry), true);
      const source = sourceOfEntry(entry);
      if (!source || !entryPlaysTrue(entry, source, hill)) return sayAt(entry.id)(T.notTrue, true);
      // Opened here, the replay leads back here.
      return onPlay(hill, { ...source, origin: "original" });
    },
    keep: (entry: ShelfEntry) => {
      confirm.disarm();
      const copy = { ...entry, id: `kept:${entry.id}` };
      const outcome = withKept(shelf, copy);
      if (outcome.refused !== null) return sayAt(entry.id)(T[outcome.refused], true);
      onChangeShelf((current) => withKept(current, copy).shelf);
      return sayAt(entry.id)(T.keptDone);
    },
    removeOne: (entry: ShelfEntry) => {
      if (!confirm.confirmed(entry.id)) return sayAt(entry.id)(T.removeArmed);
      setMessage(null);
      return remove(new Set([entry.id]));
    },
    removeSelected: () => {
      // The second press confirms these replays only: another selection asks again.
      if (!confirm.confirmed(selectedKey)) return sayAt(AT_SELECTION)(T.removeArmed);
      setMessage(null);
      return remove(new Set(chosen.map((e) => e.id)));
    },
    removeOldest: (count: number) => {
      const ids = oldestRemovable(shelf, count);
      remove(ids);
      sayAt(AT_CLEANUP)(T.removed(ids.size));
    },
    exportSelected: async () => {
      const now = new Date();
      const file = exportedReplaysFile(chosen, now);
      const outcome = await handOverFile(file, T.exportTitle, preferShare);
      sayAt(AT_SELECTION)(outcome === "cancelled" ? "" : T.exported[outcome]);
    },
    exportSelectedRpl: () => checkRpl(AT_SELECTION, (say) => handOverManyRpl(chosen, hills, preferShare, say)),
    exportRpl: (entry: ShelfEntry) => checkRpl(entry.id, (say) => handOverRpl(entry, hills, preferShare, say)),
    readFile: async (file: File) => {
      const say = sayAt(AT_FILE);
      // Nothing larger than a full shelf is read at all: it is not a file of this game.
      if (file.size > REPLAY_FILE_MAX_BYTES) return say(T.notReplayFile, true);
      const now = new Date();
      const read = await readChosenFile(new Uint8Array(await file.arrayBuffer()), originalHills, now);
      if (read.kind === "refused") return say(read.message, true);
      if (read.kind === "original") {
        const { entry } = read;
        if (entry) onChangeShelf((current) => withLoaded(current, entry).shelf);
        return onPlay(read.hill, read.source);
      }
      const check = checkAgainst(hills);
      const outcome = importedShelf(shelf, read.entries, now, check);
      onChangeShelf((current) => importedShelf(current, read.entries, now, check).shelf);
      const lines = [T.imported(outcome.added, outcome.alreadyKept)];
      if (read.unreadable > 0) lines.push(T.importUnreadable(read.unreadable));
      if (read.skipped > 0) lines.push(T.importSkipped(read.skipped));
      if (outcome.untrue > 0) lines.push(T.importUntrue(outcome.untrue));
      if (outcome.refused !== null) lines.push(T[outcome.refused]);
      const error = outcome.refused !== null || read.unreadable + read.skipped + outcome.untrue > 0;
      return say(lines.join(" "), error);
    },
  };
}

/** The note of the screen at one place, when that is where the message belongs. */
const noteAt = (message: Message, at: string) =>
  message?.at === at ? <FramedNote text={message.text} error={message.error} /> : null;

/** What is done with the selected replays at once. */
function SelectionActions({ a, message }: { a: ReturnType<typeof useReplayActions>; message: Message }) {
  const none = a.chosen.length === 0;
  const rplCount = a.chosen.filter(rplExportable).length;
  return (
    <>
      <div className="replay-row-actions">
        <button
          type="button"
          className="pixel-button small-button"
          onClick={a.allSelected ? a.selectNone : a.selectAll}
        >
          {a.allSelected ? T.selectNone : T.selectAll}
        </button>
        <button
          type="button"
          className="pixel-button small-button"
          aria-disabled={none}
          onClick={none ? undefined : () => void a.exportSelected()}
        >
          {T.exportSelected(a.chosen.length)}
        </button>
        {RPL_EXPORT_OFFERED && (
          <button
            type="button"
            className="pixel-button small-button"
            aria-disabled={rplCount === 0}
            onClick={rplCount === 0 ? undefined : () => void a.exportSelectedRpl()}
          >
            {T.rplExportSelected(rplCount)}
          </button>
        )}
        <button
          type="button"
          className="pixel-button small-button"
          aria-disabled={none}
          onClick={none ? undefined : a.removeSelected}
        >
          {a.selectedArmed ? T.confirmRemoveSelected(a.chosen.length) : T.removeSelected(a.chosen.length)}
        </button>
      </div>
      {noteAt(message, AT_SELECTION)}
    </>
  );
}

/** The replays: hill records, kept, last and read jumps, to watch, keep, export or remove; and files to read. */
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
        note={message}
        onToggle={a.toggle}
        onWatch={a.watch}
        onKeep={a.keep}
        onRemove={a.removeOne}
        onExportRpl={(entry) => void a.exportRpl(entry)}
      />
      {shelf.length > 0 && <SelectionActions a={a} message={message} />}
      {shelf.length > 0 && (
        <>
          <p className="note">
            {T.usage(shelf.length, formatSize(shelfBytes(shelf)), formatSize(REPLAY_LIMITS.BUDGET_BYTES))}
          </p>
          <RemoveOldest onRemove={a.removeOldest} />
          {noteAt(message, AT_CLEANUP)}
        </>
      )}
      {originalHills.length === 0 && <p className="note">{typeset(T.needsGame)}</p>}
      <div className="menu">
        <label className="pixel-button file-label">
          {T.load}
          {/* No accept filter: a phone may not know .rpl and grey such files out. The file is checked instead. */}
          <input type="file" onChange={onFile} />
        </label>
        {noteAt(message, AT_FILE)}
      </div>
      <div className="settings-list">
        <ReplaySettingsControls replays={props.settings.replays} onSettings={props.onSettings} />
      </div>
      <div className="menu">
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
      {storeName === "memory" && <p className="note error">{T.onlyForVisit}</p>}
      {/* Always there, so a screen reader hears each message as it changes; the eye reads it where it shows. */}
      <p className="sr-only" role="status">
        {typeset(message?.text ?? "")}
      </p>
    </main>
  );
}
