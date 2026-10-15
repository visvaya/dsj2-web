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
/**
 * The icon's backdrop is lighter than the scene's: light colours this close to grey (the snow, the sky's haze) move
 * this far towards white, so the jumper stands out on a launcher; the jumper, skis, trees and fence keep their colours.
 */
const GREY_SPREAD = 30;
const LIGHT_FROM = 120;
const BACKDROP_LIGHTEN = 0.3;

const towardWhite = (c: number) => Math.round(c + (255 - c) * BACKDROP_LIGHTEN);

/** A pixel moved towards white when it is nearly grey. */
function lightenedIfGrey(r: number, g: number, b: number): [number, number, number] {
  if (Math.max(r, g, b) - Math.min(r, g, b) > GREY_SPREAD || Math.min(r, g, b) < LIGHT_FROM) return [r, g, b];
  return [towardWhite(r), towardWhite(g), towardWhite(b)];
}

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
    const at = i * RGBA_CHANNELS;
    rgb.set(lightenedIfGrey(fb.bytes[at] ?? 0, fb.bytes[at + 1] ?? 0, fb.bytes[at + 2] ?? 0), i * RGB_CHANNELS);
  }
  return { sizePx, rgb };
}
