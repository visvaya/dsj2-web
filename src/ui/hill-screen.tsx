import type { HillChoice } from "../game/hill-choice";

interface Props {
  hills: readonly HillChoice[];
  onPick: (hill: HillChoice) => void;
  onBack: () => void;
}

export function HillScreen({ hills, onPick, onBack }: Props) {
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
              <span>K{h.kPointM}</span>
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
