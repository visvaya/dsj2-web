import { entryBytes, sameReplay, type Shelf, type ShelfEntry, type ShelfKind } from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.replays;
const BYTES_PER_KB = 1000;
const GROUPS: readonly ShelfKind[] = ["record", "kept", "recent"];

export const kb = (bytes: number): string => T.sizeKb((bytes / BYTES_PER_KB).toFixed(1));

/** The name of a replay: its hill, and the jumper's name for a file of the original. */
const replayName = (entry: ShelfEntry): string => {
  const name = UI_TEXT.hillLabel(entry.hill.name, entry.hill.kPointM);
  const jumper = entry.replay.kind === "original" ? entry.replay.jumperName : undefined;
  return jumper === undefined ? name : `${name} · ${jumper}`;
};

/** The line under a replay's name: its result, its date and what it weighs. */
function rowText(entry: ShelfEntry): string {
  const { distanceM, points, fell } = entry.result;
  const distance = fell ? `${distanceM.toFixed(2)} (${T.fell})` : distanceM.toFixed(2);
  const date = new Date(entry.dateIso).toLocaleDateString("pl-PL");
  return T.row(distance, points.toFixed(1), date, kb(entryBytes(entry)));
}

interface ListProps {
  shelf: Shelf;
  selected: ReadonlySet<string>;
  /** The replay whose removal waits for a second press. */
  confirming: string | null;
  onToggle: (entry: ShelfEntry) => void;
  onWatch: (entry: ShelfEntry) => void;
  onKeep: (entry: ShelfEntry) => void;
  onRemove: (entry: ShelfEntry) => void;
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
            {T.keep}
          </button>
        )}
        <button type="button" className="pixel-button small-button" onClick={() => p.onRemove(entry)}>
          {p.confirming === entry.id ? T.confirmRemove : T.remove}
        </button>
      </span>
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
