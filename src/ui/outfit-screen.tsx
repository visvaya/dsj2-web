import { useEffect, useMemo, useRef } from "react";
import { OWN_HILLS } from "../game/hill-choice";
import { OUTFIT_PARTS, type Outfit, type OutfitPart } from "../game/outfit";
import { previewFlightState } from "../game/outfit-preview";
import { FrameBuffer } from "../render/frame-buffer";
import { drawJumperPreview } from "../render/jump-view";
import { OUTFIT_SWATCHES } from "../render/palette";

interface Props {
  outfit: Outfit;
  onChange: (outfit: Outfit) => void;
  onBack: () => void;
}

/** Part labels as in the original's editor. */
const PART_LABEL: Readonly<Record<OutfitPart, string>> = {
  pants: "Spodnie",
  sleeves: "Rękawy",
  gloves: "Rękawice",
  helmet: "Kask",
  skis: "Narty",
};

const SWATCH_NAMES: readonly string[] = [
  "czarny",
  "szary",
  "oliwkowy",
  "pomarańczowy",
  "brązowy",
  "czerwony",
  "karmazynowy",
  "purpurowy",
  "fioletowy",
  "niebieski",
  "morski",
  "zielony",
];

const PREVIEW_WIDTH_PX = 84;
const PREVIEW_HEIGHT_PX = 48;
const PREVIEW_SCALE = 4;

function css([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r} ${g} ${b})`;
}

export function OutfitScreen({ outfit, onChange, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hill = OWN_HILLS[0];
  const flight = useMemo(() => (hill ? previewFlightState(hill) : null), [hill]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !hill || !flight) return;
    const fb = new FrameBuffer(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
    drawJumperPreview(fb, { profile: hill.profile, state: flight, outfit });
    ctx.putImageData(new ImageData(fb.bytes, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX), 0, 0);
  }, [hill, flight, outfit]);

  return (
    <main className="screen">
      <h1 className="screen-title">Edycja kolorów stroju</h1>
      <hr className="rule" />
      <div className="outfit-editor">
        <div className="outfit-rows">
          {OUTFIT_PARTS.map((part) => (
            <fieldset key={part} className="outfit-row">
              <legend>{PART_LABEL[part]}</legend>
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
                    <span className="sr-only">{SWATCH_NAMES[i]}</span>
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
          style={{ width: PREVIEW_WIDTH_PX * PREVIEW_SCALE, height: PREVIEW_HEIGHT_PX * PREVIEW_SCALE }}
          role="img"
          aria-label="Podgląd skoczka w wybranym stroju"
        />
      </div>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          Wstecz
        </button>
      </div>
    </main>
  );
}
