import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";
import { FlagIcon } from "./flag-icon";

interface Props {
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPick: (hill: HillChoice) => void;
  onBack: () => void;
}

function HillList({ title, hills, records, onPick }: Omit<Props, "onBack"> & { title: string }) {
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

export function HillScreen({ hills, records, onPick, onBack }: Props) {
  return (
    <main className="screen">
      <h1 className="screen-title">Wybierz skocznię do treningu</h1>
      <hr className="rule" />
      <HillList title="Skocznie własne" hills={hills.filter((h) => h.source === "own")} records={records} onPick={onPick} />
      <HillList title="Skocznie z oryginału" hills={hills.filter((h) => h.source === "original")} records={records} onPick={onPick} />
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          Wstecz
        </button>
      </div>
    </main>
  );
}
