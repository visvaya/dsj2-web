import { OWN_HILLS } from "../game/hill-choice";
import { DEFAULT_OUTFIT } from "../game/outfit";
import { previewFlightState } from "../game/outfit-preview";
import { FrameBuffer } from "../render/frame-buffer";
import { drawJumperPreview, type PreviewAnchor } from "../render/jump-view";

/**
 * The jumper stands left of and below the middle, so the figure, which reaches forward and up from the
 * skis, ends up in the middle of the picture. Launchers cut icons to circles and rounded squares; the
 * figure has to stay inside a circle of 0.4 of the side around the centre.
 */
const ICON_ANCHOR: PreviewAnchor = { xShare: 0.42, yShare: 0.56 };
const RGB_CHANNELS = 3;
const RGBA_CHANNELS = 4;

export interface IconPicture {
  sizePx: number;
  /** sizePx * sizePx pixels, three bytes each, rows from the top; no transparency. */
  rgb: Uint8Array;
}

/**
 * The picture the game's icons are made of: this project's own jumper in flight over its own hill, drawn by
 * the game's renderer from a fixed seed, at the game's own pixel size. `scripts/make-icons.mjs` enlarges it
 * by whole factors.
 */
export function iconPicture(sizePx: number): IconPicture {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("The game has no hill of its own to draw the icon on");
  const fb = new FrameBuffer(sizePx, sizePx);
  drawJumperPreview(fb, { hill, state: previewFlightState(hill), outfit: DEFAULT_OUTFIT }, ICON_ANCHOR);
  const rgb = new Uint8Array(sizePx * sizePx * RGB_CHANNELS);
  for (let i = 0; i < sizePx * sizePx; i++) {
    rgb.set(fb.bytes.subarray(i * RGBA_CHANNELS, i * RGBA_CHANNELS + RGB_CHANNELS), i * RGB_CHANNELS);
  }
  return { sizePx, rgb };
}
