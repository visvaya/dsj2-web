import { useRef } from "react";
import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";
import { FlagIcon } from "./flag-icon";
import { useEntryFocus } from "./use-entry-focus";

interface Props {
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPick: (hill: HillChoice) => void;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

function HillList({ title, hills, records, onPick }: Pick<Props, "hills" | "records" | "onPick"> & { title: string }) {
  if (hills.length === 0) return null;
  return (
    <section className="hill-section" aria-label={title}>
      <h2 className="hill-section-title">{title}</h2>
      <ul className="hill-grid">
        {hills.map((h) => {
          const record = records[h.id];
          return (
            <li key={h.id}>
              <button type="button" className="hill-item" onClick={() => onPick(h)}>
                <FlagIcon country={h.country} />
                <span className="hill-item-name">{h.name}</span>
                <span className="hill-item-k">K{h.kPointM}</span>
                {record ? <span className="hill-item-record">rekord {record.distanceM.toFixed(2)} m</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The hills to choose from: the game's own, then the original's when the player has loaded them. */
export function HillLists({ hills, records, onPick }: Pick<Props, "hills" | "records" | "onPick">) {
  return (
    <>
      <HillList
        title="Skocznie własne"
        hills={hills.filter((h) => h.source === "own")}
        records={records}
        onPick={onPick}
      />
      <HillList
        title="Skocznie z oryginału"
        hills={hills.filter((h) => h.source === "original")}
        records={records}
        onPick={onPick}
      />
    </>
  );
}

/** The title of the list, on its screen and where the list is shown over a jump. */
export const HILL_LIST_TITLE = "Wybierz skocznię do treningu";

export function HillScreen({ hills, records, onPick, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {HILL_LIST_TITLE}
      </h1>
      <hr className="rule" />
      <HillLists hills={hills} records={records} onPick={onPick} />
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          Wstecz
        </button>
      </div>
    </main>
  );
}
