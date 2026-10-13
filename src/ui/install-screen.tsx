import { useRef } from "react";
import { useEntryFocus } from "./use-entry-focus";

/** How to put the game on the home screen or the desktop, per kind of device. */
const INSTALL_STEPS: readonly { title: string; text: string }[] = [
  {
    title: "iPhone i iPad",
    text: "Otwórz grę w Safari, dotknij przycisku Udostępnij (kwadrat ze strzałką w górę), wybierz „Do ekranu początkowego” i potwierdź „Dodaj”.",
  },
  {
    title: "Android",
    text: "W Chrome otwórz menu (trzy kropki) i wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”.",
  },
  {
    title: "Komputer",
    text: "W Chrome albo Edge kliknij ikonę instalacji na końcu paska adresu albo wybierz w menu przeglądarki pozycję instalacji tej strony.",
  },
  {
    title: "Po instalacji",
    text: "Gra uruchamia się z własnej ikony, bez paska adresu, i działa bez internetu. Pierwszy raz otwórz ją z siecią, żeby pobrała się w całości.",
  },
];

interface Props {
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** The instructions for installing the game as an application, opened from the main menu. */
export function InstallScreen({ onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        Gra jako aplikacja
      </h1>
      <p className="note">Telemark można dodać do ekranu głównego telefonu albo zainstalować na komputerze.</p>
      <dl className="how-to">
        {INSTALL_STEPS.map((step) => (
          <div key={step.title} className="how-to-step">
            <dt>{step.title}</dt>
            <dd>{step.text}</dd>
          </div>
        ))}
      </dl>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          Wstecz
        </button>
      </div>
    </main>
  );
}
