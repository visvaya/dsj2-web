import { useRef } from "react";
import { UI_TEXT } from "../text/ui-text";
import { useEntryFocus } from "./use-entry-focus";

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
        {UI_TEXT.install.title}
      </h1>
      <p className="note">{UI_TEXT.install.intro}</p>
      <dl className="how-to">
        {UI_TEXT.install.steps.map((step) => (
          <div key={step.title} className="how-to-step">
            <dt>{step.title}</dt>
            <dd>{step.text}</dd>
          </div>
        ))}
      </dl>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
