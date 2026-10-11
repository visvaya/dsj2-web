import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";

interface Props {
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPick: (hill: HillChoice) => void;
  onBack: () => void;
}

export function HillScreen({ hills, records, onPick, onBack }: Props) {
  return (
    <main className="screen">
      <h1 className="title" style={{ fontSize: 36 }}>
        Wybierz skocznię do treningu
      </h1>
      <hr className="rule" />
      <ul className="hill-grid" aria-label="Skocznie">
        {hills.map((h) => (
          <li key={h.id}>
            <button type="button" className="pixel-button" onClick={() => onPick(h)}>
              <span>{h.name}</span>
              <span>
                K{h.kPointM}
                {records[h.id] ? <span className="record"> · {records[h.id]?.distanceM.toFixed(2)} m</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          Wstecz
        </button>
      </div>
    </main>
  );
}
