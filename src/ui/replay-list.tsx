import { entryBytes, sameReplay, type Shelf, type ShelfEntry, type ShelfKind } from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";
import { typeset } from "./typeset";
import { formatDecimal, formatSize } from "./number-text";
import { replayHillLabel } from "./replay-hill";
import { RPL_EXPORT_OFFERED, rplExportable } from "./rpl-export";

const T = UI_TEXT.replays;
const GROUPS: readonly ShelfKind[] = ["record", "kept", "recent", "loaded"];

/** The name of a replay: its hill, and the jumper's name for a file of the original. */
const replayName = (entry: ShelfEntry): string => {
  const name = replayHillLabel(entry);
  const jumper = entry.replay.kind === "original" ? entry.replay.jumperName : undefined;
  return jumper === undefined ? name : `${name} · ${jumper}`;
};

/** The day and the time of a replay, to the second, so that jumps of one session are told apart. */
function whenText(dateIso: string): string {
  const when = new Date(dateIso);
  return T.when(when.toLocaleDateString("pl-PL"), when.toLocaleTimeString("pl-PL"));
}

/** The line under a replay's name: its result, when it was jumped and what it weighs. */
function rowText(entry: ShelfEntry): string {
  const { distanceM, points, fell } = entry.result;
  return T.row(
    T.distance(formatDecimal(distanceM, 2), fell),
    formatDecimal(points, 1),
    whenText(entry.dateIso),
    formatSize(entryBytes(entry)),
  );
}

/**
 * A message framed where it belongs, like the note under the button that quits the game: in the colour of the game,
 * or in red for what did not work. A screen reader hears it from the status of the screen instead. The text is set as
 * every framed note's (`typeset`).
 */
export function FramedNote({ text, error }: { text: string; error: boolean }) {
  return (
    <p className={error ? "note framed-note error-frame" : "note framed-note"} aria-hidden="true">
      {typeset(text)}
    </p>
  );
}

interface ListProps {
  shelf: Shelf;
  selected: ReadonlySet<string>;
  /** The replay whose removal waits for a second press. */
  confirming: string | null;
  /** What the screen tells, shown under the replay it is about. */
  note: { text: string; error: boolean; at: string } | null;
  onToggle: (entry: ShelfEntry) => void;
  onWatch: (entry: ShelfEntry) => void;
  onKeep: (entry: ShelfEntry) => void;
  onRemove: (entry: ShelfEntry) => void;
  /** Gives the replay as a file of the original game. */
  onExportRpl: (entry: ShelfEntry) => void;
}

function ReplayRow({ entry, p, keepable }: { entry: ShelfEntry; p: ListProps; keepable: boolean }) {
  const name = replayName(entry);
  return (
    <li className="replay-row">
      <label className="settings-check replay-row-hill">
        <input
          type="checkbox"
          aria-label={T.select(name)}
          checked={p.selected.has(entry.id)}
          onChange={() => p.onToggle(entry)}
        />
        {name}
      </label>
      <span className="replay-row-detail">{rowText(entry)}</span>
      <span className="replay-row-actions">
        <button type="button" className="pixel-button small-button" onClick={() => p.onWatch(entry)}>
          {T.watch}
        </button>
        {keepable && (
          <button type="button" className="pixel-button small-button" onClick={() => p.onKeep(entry)}>
            {/* A record's replay goes once the record is beaten; kept, it stays. */}
            {entry.kind === "record" ? T.keepForGood : T.keep}
          </button>
        )}
        {RPL_EXPORT_OFFERED && rplExportable(entry) && (
          <button
            type="button"
            className="pixel-button small-button"
            aria-label={T.rplExportLabel(name)}
            onClick={() => p.onExportRpl(entry)}
          >
            {T.rplExport}
          </button>
        )}
        <button type="button" className="pixel-button small-button" onClick={() => p.onRemove(entry)}>
          {p.confirming === entry.id ? T.confirmRemove : T.remove}
        </button>
      </span>
      {p.note?.at === entry.id && <FramedNote text={p.note.text} error={p.note.error} />}
    </li>
  );
}

/** The replays in three groups: hill records, kept and last jumps, the newest first in each. */
export function ReplayList(p: ListProps) {
  const kept = p.shelf.filter((e) => e.kind === "kept");
  return GROUPS.map((kind) => {
    const entries = p.shelf.filter((e) => e.kind === kind).toReversed();
    if (entries.length === 0) return null;
    return (
      <section key={kind} className="replay-group" aria-label={T.groups[kind]}>
        <h2 className="hill-section-title">{T.groups[kind]}</h2>
        <ul className="replay-list">
          {entries.map((entry) => (
            <ReplayRow
              key={entry.id}
              entry={entry}
              p={p}
              keepable={kind !== "kept" && !kept.some((k) => sameReplay(k, entry))}
            />
          ))}
        </ul>
      </section>
    );
  });
}
