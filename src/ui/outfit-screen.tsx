import { useEffect, useMemo, useRef } from "react";
import { OWN_HILLS } from "../game/hill-choice";
import { OUTFIT_PARTS, type Outfit } from "../game/outfit";
import { previewFlightState } from "../game/outfit-preview";
import { FrameBuffer } from "../render/frame-buffer";
import { drawJumperPreview } from "../render/jump-view";
import { OUTFIT_SWATCHES } from "../render/palette";
import { UI_TEXT } from "../text/ui-text";
import { useEntryFocus } from "./use-entry-focus";

interface Props {
  outfit: Outfit;
  onChange: (outfit: Outfit) => void;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

const PREVIEW_WIDTH_PX = 84;
const PREVIEW_HEIGHT_PX = 48;
const PREVIEW_SCALE = 4;

function css([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r} ${g} ${b})`;
}

export function OutfitScreen({ outfit, onChange, onBack, focusOnEntry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const hill = OWN_HILLS[0];
  const flight = useMemo(() => (hill ? previewFlightState(hill) : null), [hill]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !hill || !flight) return;
    const fb = new FrameBuffer(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
    drawJumperPreview(fb, { hill, state: flight, outfit });
    ctx.putImageData(new ImageData(fb.bytes, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX), 0, 0);
  }, [hill, flight, outfit]);

  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.outfit.title}
      </h1>
      <hr className="rule" />
      <div className="outfit-editor">
        <div className="outfit-rows">
          {OUTFIT_PARTS.map((part) => (
            <fieldset key={part} className="outfit-row">
              <legend>{UI_TEXT.outfit.part[part]}</legend>
              <div className="swatches">
                {OUTFIT_SWATCHES.map((rgb, i) => (
                  <label key={css(rgb)} className="swatch" style={{ background: css(rgb) }}>
                    <input
                      type="radio"
                      className="sr-only"
                      name={`outfit-${part}`}
                      checked={outfit[part] === i}
                      onChange={() => onChange({ ...outfit, [part]: i })}
                    />
                    <span className="sr-only">{UI_TEXT.outfit.swatch[i]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className="outfit-preview"
          width={PREVIEW_WIDTH_PX}
          height={PREVIEW_HEIGHT_PX}
          style={{ width: PREVIEW_WIDTH_PX * PREVIEW_SCALE }}
          role="img"
          aria-label={UI_TEXT.outfit.preview}
        />
      </div>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
