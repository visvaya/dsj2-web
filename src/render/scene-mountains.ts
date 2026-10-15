import type { HillProfile } from "../sim/hill-profile";
import { hash } from "./jump-view-camera";
import { rowsAt } from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { backgroundLayerTable } from "./scene-backdrop";
import { layerOffset, originalColumn, type SceneView } from "./scene-layers";
import { hazedPalette } from "./scene-palette";
import type { SceneCanvas } from "./scene-span";

/**
 * This project's far mountains (the original has none): a range of snowy peaks with bare rock lower down, standing
 * on the farthest background layer and moving even more slowly than it, faded towards the sky's colour.
 */

/** Background layer the range stands on, and the share of its scroll the range follows. */
const BASE_LAYER = 1;
const MOUNTAIN_SCROLL = 0.5;
/** One candidate peak per cell, each a triangle with its own height and steepness (original columns, rows). */
const PEAK_CELL = 55;
const PEAK_MIN_ROWS = 6;
const PEAK_SPAN_ROWS = 16;
/** Height of the range between the peaks. */
const RANGE_BASE_ROWS = 3;
/** Peaks stay this many rows clear of the top of the picture. */
const TOP_MARGIN_ROWS = 2;
/** Palette indices: lit and shaded snow, lit and shaded rock; haze towards the sky near the horizon. */
const SNOW = { lit: 0x3f, shade: 0x34 } as const;
const ROCK = { lit: 0x1e, shade: 0x16 } as const;
const HAZE_INDEX = 0xfc;
const HAZE_SHARE = 0.45;

interface Ridge {
  rows: number;
  /** Height above the base where the snow ends (rock below). */
  snowline: number;
  /** On the right-hand face of its peak, away from the light. */
  shaded: boolean;
}

/** The range at mountain coordinate `fx`: the highest of the nearby triangular peaks. */
function ridgeAt(fx: number): Ridge {
  const cell = Math.floor(fx / PEAK_CELL);
  let best: Ridge = { rows: RANGE_BASE_ROWS, snowline: RANGE_BASE_ROWS, shaded: false };
  for (let k = cell - 2; k <= cell + 2; k++) {
    const r = hash(k * 2654435761 + 17);
    const centre = k * PEAK_CELL + (r % PEAK_CELL);
    const peak = PEAK_MIN_ROWS + ((r >>> 8) % PEAK_SPAN_ROWS);
    const steepness = 0.45 + ((r >>> 16) % 40) / 100;
    const rows = Math.round(peak - Math.abs(fx - centre) * steepness);
    if (rows > best.rows) {
      // A ragged snowline at a little over half the peak's height.
      const jag = (hash(Math.round(fx) * 31 + k) % 3) - 1;
      best = { rows, snowline: Math.round(peak * 0.45) + jag, shaded: fx > centre };
    }
  }
  return best;
}

/** The range behind the farthest background layer, over the sky and under everything else. */
export function drawMountains(c: SceneCanvas, h: HillProfile, look: HillLook, view: SceneView, far: Uint32Array) {
  const base = backgroundLayerTable(h, look, BASE_LAYER);
  if (base === undefined) return;
  const pal = hazedPalette(far, HAZE_INDEX, HAZE_SHARE);
  const off = layerOffset(view, BASE_LAYER);
  const scroll = off.x * MOUNTAIN_SCROLL;
  const { fb, indices } = c;
  const pixels = fb.pixels;
  for (let sx = 0; sx < fb.width; sx++) {
    const column = originalColumn(view, sx);
    const ground = Math.min(c.lastRow + 1, rowsAt(base, off.x + column) + off.y);
    if (ground <= TOP_MARGIN_ROWS) continue;
    const ridge = ridgeAt(column + scroll);
    const rows = Math.min(ridge.rows, ground - TOP_MARGIN_ROWS);
    const snowline = ground - ridge.snowline;
    for (let y = Math.max(0, ground - rows); y < ground; y++) {
      const snow = y < snowline;
      const index = ridge.shaded ? (snow ? SNOW.shade : ROCK.shade) : snow ? SNOW.lit : ROCK.lit;
      const i = y * fb.width + sx;
      indices[i] = index;
      pixels[i] = pal[index] ?? 0;
    }
  }
}
