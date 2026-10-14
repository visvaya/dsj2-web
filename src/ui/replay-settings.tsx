import { REPLAY_SETTING_RANGES, type ReplaySettings, type Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.settings.replays;
const R = REPLAY_SETTING_RANGES;
const KB_PER_MB = 1000;
/** What a clean-up starts at when the player switches it on. */
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_MAX_SIZE_KB = 2000;

interface Props {
  replays: ReplaySettings;
  onSettings: (change: Partial<Settings>) => void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** A clean-up rule: a box that switches it on, and the number it keeps to. */
function CleanupRule(p: {
  label: string;
  value: number | null;
  shown: (value: number) => number;
  fallback: number;
  min: number;
  max: number;
  step: number;
  stored: (shown: number) => number;
  onChange: (value: number | null) => void;
}) {
  const on = p.value !== null;
  return (
    <div className="settings-rule">
      <label className="settings-check">
        <input type="checkbox" checked={on} onChange={(e) => p.onChange(e.currentTarget.checked ? p.fallback : null)} />
        {p.label}
      </label>
      <input
        type="number"
        aria-label={p.label}
        disabled={!on}
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.shown(p.value ?? p.fallback)}
        onChange={(e) => {
          const typed = Number(e.currentTarget.value);
          if (Number.isFinite(typed) && typed > 0) p.onChange(p.stored(clamp(typed, p.min, p.max)));
        }}
      />
    </div>
  );
}

/** Shows or hides the slider under the picture of a replay. */
export function ReplaySliderToggle({ replays, onSettings }: Props) {
  return (
    <button
      type="button"
      className="pixel-button"
      aria-pressed={replays.slider}
      onClick={() => onSettings({ replays: { ...replays, slider: !replays.slider } })}
    >
      {replays.slider ? T.sliderOn : T.sliderOff}
    </button>
  );
}

/** What is kept of the replays besides the hill records, what goes on its own, and the slider of a replay. */
export function ReplaySettingsControls({ replays, onSettings }: Props) {
  const set = (change: Partial<ReplaySettings>) => onSettings({ replays: { ...replays, ...change } });
  const counts = R.RECENT_COUNTS;
  const next = counts[(counts.findIndex((c) => c === replays.recentCount) + 1) % counts.length] ?? 0;
  return (
    <section className="settings-group" aria-label={T.group}>
      <h2 className="hill-section-title">{T.group}</h2>
      <button type="button" className="pixel-button" onClick={() => set({ recentCount: next })}>
        {T.recent(replays.recentCount)}
      </button>
      <ReplaySliderToggle replays={replays} onSettings={onSettings} />
      <CleanupRule
        label={T.maxAge}
        value={replays.maxAgeDays}
        shown={(days) => days}
        stored={(days) => Math.round(days)}
        fallback={DEFAULT_MAX_AGE_DAYS}
        min={R.MAX_AGE_DAYS_MIN}
        max={R.MAX_AGE_DAYS_MAX}
        step={1}
        onChange={(maxAgeDays) => set({ maxAgeDays })}
      />
      <CleanupRule
        label={T.maxSize}
        value={replays.maxSizeKb}
        shown={(kb) => kb / KB_PER_MB}
        stored={(mb) => Math.round(mb * KB_PER_MB)}
        fallback={DEFAULT_MAX_SIZE_KB}
        min={R.MAX_SIZE_KB_MIN / KB_PER_MB}
        max={R.MAX_SIZE_KB_MAX / KB_PER_MB}
        step={0.1}
        onChange={(maxSizeKb) => set({ maxSizeKb })}
      />
      <p className="note">{T.recordsStay}</p>
    </section>
  );
}
