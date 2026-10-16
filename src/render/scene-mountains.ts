import type { HillProfile } from "../sim/hill-profile";
import { FrameBuffer } from "./frame-buffer";
import { hash } from "./jump-view-camera";
import { rowsAt } from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { litRgb } from "./palette";
import { backgroundLayerTable } from "./scene-backdrop";
import { layerOffset, originalColumn, type SceneView } from "./scene-layers";
import { hazedPalette } from "./scene-palette";
import type { SceneCanvas } from "./scene-span";

/**
 * This project's far mountains (the original has none): a ragged range of snowy ridges with gullies of bare rock,
 * standing on the farthest background layer and moving even more slowly than it, faded into a cool haze.
 */

/** Background layer the range stands on, and the share of its scroll the range follows. */
const BASE_LAYER = 1;
const MOUNTAIN_SCROLL = 0.5;
/** The ridge line: octaves of noise (wavelength in columns, height in rows), sharpened into crests. */
const RIDGE_OCTAVES = [
  { wavelength: 110, rows: 20, crest: true },
  { wavelength: 41, rows: 8, crest: true },
  { wavelength: 13, rows: 2.5, crest: false },
  { wavelength: 5, rows: 1, crest: false },
] as const;
/** Rows taken off the ridge, so the range breaks into peaks with the horizon between them. */
const RIDGE_SINK_ROWS = 9;
/** The highest the ridge gets: the octaves' heights less the sink. */
const RIDGE_MAX_ROWS = RIDGE_OCTAVES.reduce((sum, o) => sum + o.rows, 0) - RIDGE_SINK_ROWS;
/** Peaks stay this many rows clear of the top of the picture. */
const TOP_MARGIN_ROWS = 2;
/** Snow covers the ridge down to this share of its height above the foot, give or take the noise. */
const SNOWLINE_SHARE = 0.45;
/** Palette indices: lit and shaded snow, lit and shaded rock. */
const SNOW = { lit: 0x3f, shade: 0x36 } as const;
const ROCK = { lit: 0x24, shade: 0x18 } as const;
/** The haze the range fades into: a cool light grey-blue, whatever the hill's sky, and how far. */
const HAZE_RGB = [176, 188, 214] as const;
const HAZE_SHARE = 0.42;

/** Smooth value noise in 0..1 at `x`, one random value per whole step. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i * 7919 + seed) / 0x1_0000_0000;
  const b = hash((i + 1) * 7919 + seed) / 0x1_0000_0000;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

/** Ridge heights already worked out, by mountain coordinate (the view scrolls slowly over the same ones). */
const ridgeCache = new Map<number, number>();
const RIDGE_CACHE_LIMIT = 4096;

/** Height of the ridge in rows at mountain coordinate `fx`, remembered. */
function ridgeRows(fx: number): number {
  let rows = ridgeCache.get(fx);
  if (rows === undefined) {
    if (ridgeCache.size >= RIDGE_CACHE_LIMIT) ridgeCache.clear();
    rows = ridgeOf(fx);
    ridgeCache.set(fx, rows);
  }
  return rows;
}

/** Height of the ridge in rows at mountain coordinate `fx`: crests where the noise folds over. */
function ridgeOf(fx: number): number {
  let rows = 0;
  RIDGE_OCTAVES.forEach((o, k) => {
    const n = noise(fx / o.wavelength, k * 104729);
    rows += o.rows * (o.crest ? 1 - Math.abs(2 * n - 1) : n);
  });
  return Math.max(0, rows - RIDGE_SINK_ROWS);
}

/** The range in one column of the picture: its foot on the farthest layer, its height in rows, and where it is. */
interface RangeColumn {
  ground: number;
  height: number;
  rows: number;
  fx: number;
}

/**
 * The range's columns for a view: for each column of the picture, its foot and height (none where the farthest
 * layer is off the top of the picture). Undefined for a hill without that layer.
 */
function rangeColumns(h: HillProfile, look: HillLook, view: SceneView, lastRow: number) {
  const base = backgroundLayerTable(h, look, BASE_LAYER);
  if (base === undefined) return undefined;
  const off = layerOffset(view, BASE_LAYER);
  const scroll = off.x * MOUNTAIN_SCROLL;
  return (sx: number): RangeColumn | null => {
    const column = originalColumn(view, sx);
    const ground = Math.min(lastRow + 1, rowsAt(base, off.x + column) + off.y);
    if (ground <= TOP_MARGIN_ROWS) return null;
    const fx = column + scroll;
    // Where the horizon is high the whole range is lower, so its peaks are never cut flat by the top edge.
    const squash = Math.min(1, (ground - TOP_MARGIN_ROWS) / RIDGE_MAX_ROWS);
    const height = ridgeRows(fx) * squash;
    return { ground, height, rows: height > 0 ? Math.round(height) : 0, fx };
  };
}

/**
 * Rows of open sky at the top of each column of the picture for a view: down to the ridge, or to the farthest
 * layer where the range has no height there.
 */
export function skyRowsAbove(h: HillProfile, look: HillLook, view: SceneView, lastRow: number): (sx: number) => number {
  const range = rangeColumns(h, look, view, lastRow);
  return (sx) => {
    const at = range?.(sx);
    if (at === undefined || at === null) return lastRow + 1;
    return Math.max(0, at.ground - at.rows);
  };
}

/** The range behind the farthest background layer, over the sky and under everything else. */
export function drawMountains(c: SceneCanvas, h: HillProfile, look: HillLook, view: SceneView, far: Uint32Array) {
  const range = rangeColumns(h, look, view, c.lastRow);
  if (range === undefined) return;
  const pal = hazedPalette(far, FrameBuffer.pack(litRgb(HAZE_RGB, true)), HAZE_SHARE);
  const { fb, indices } = c;
  const pixels = fb.pixels;
  for (let sx = 0; sx < fb.width; sx++) {
    const at = range(sx);
    if (at === null || at.height <= 0) continue;
    const { ground, height, rows, fx } = at;
    // A face falling to the right is turned from the light, which comes from the left.
    const shaded = ridgeRows(fx + 2) < ridgeRows(fx - 2);
    // A ragged snowline: the snow reaches further down on the higher parts of the ridge.
    const snowline = ground - Math.round(height * SNOWLINE_SHARE + 4 * noise(fx / 6, 31) - 2);
    for (let y = Math.max(0, ground - rows); y < ground; y++) {
      const snow = y < snowline;
      const index = snow ? (shaded ? SNOW.shade : SNOW.lit) : shaded ? ROCK.shade : ROCK.lit;
      const i = y * fb.width + sx;
      indices[i] = index;
      pixels[i] = pal[index] ?? 0;
    }
  }
}
