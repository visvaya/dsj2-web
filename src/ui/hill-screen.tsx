import { useRef } from "react";
import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
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
                <span className="hill-item-k">{UI_TEXT.hills.kPoint(h.kPointM)}</span>
                {record ? (
                  <span className="hill-item-record">{UI_TEXT.hills.record(record.distanceM.toFixed(2))}</span>
                ) : null}
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
        title={UI_TEXT.hills.own}
        hills={hills.filter((h) => h.source === "own")}
        records={records}
        onPick={onPick}
      />
      <HillList
        title={UI_TEXT.hills.original}
        hills={hills.filter((h) => h.source === "original")}
        records={records}
        onPick={onPick}
      />
    </>
  );
}

export function HillScreen({ hills, records, onPick, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.hills.title}
      </h1>
      <hr className="rule" />
      <HillLists hills={hills} records={records} onPick={onPick} />
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
