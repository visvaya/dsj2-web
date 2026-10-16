import type { HillProfile } from "../sim/hill-profile";
import { hillLayerTables, rowsAt } from "./hill-layer-tables";
import {
  LAYER,
  LAYER_SCALE,
  ORIGINAL_CENTRE_COLUMN,
  ORIGINAL_PX_PER_M,
  layerOffset,
  originalColumn,
  type SceneView,
} from "./scene-layers";
import type { SceneCanvas } from "./scene-span";

/**
 * This project's night light on the hill. The floodlights stand on masts along the far fence and light the hill
 * around them; the inrun has its own lamps. Away from the masts, under the inrun, the snow is only weakly lit and
 * takes on the moonlit colours of the background, in a few steps like the bands of the original's palette.
 * Every step is placed by world x on the hill, so it stays put while the camera follows the jumper.
 */
export const FLOODLIGHT = {
  /** Masts on the far fence: the first a little past the takeoff, then at a regular spacing. */
  mastSpacingM: 30,
  firstMastAfterTakeoffM: 12,
  /** The hill is fully lit this far from a mast: half the spacing, so the pools of neighbouring masts meet. */
  fullLightM: 15,
  /** Width of each weaker step of light beyond that. */
  stepM: 8,
  /** Share of the moonlit colour in each step, from the one next to the full light outwards. */
  stepShares: [0.2, 0.4, 0.55, 0.7],
  /** How much nearer (in layer scale) each row of the snow in front of the near edge lies. */
  nearGroundScalePerRow: 0.02,
} as const;

/** World x of the first floodlight mast. */
export function firstMastXM(h: HillProfile): number {
  return h.takeoffXM + FLOODLIGHT.firstMastAfterTakeoffM;
}

/**
 * The step of light at world x on the hill: 0 within full reach of a mast, 1 to `stepShares.length` going away
 * from the first mast towards the top of the inrun. Masts stand all along the hill past the first, so beyond it
 * the hill is always within full reach.
 */
export function floodlightStep(h: HillProfile, xM: number): number {
  const short = firstMastXM(h) - FLOODLIGHT.fullLightM - xM;
  if (short <= 0) return 0;
  return Math.min(FLOODLIGHT.stepShares.length, Math.ceil(short / FLOODLIGHT.stepM));
}

/** A packed colour moved `share` (0..1) of the way towards another, alpha kept. */
export function mixPacked(from: number, to: number, share: number): number {
  const channel = (shift: number) => {
    const a = (from >>> shift) & 0xff;
    return Math.round(a + (((to >>> shift) & 0xff) - a) * share) << shift;
  };
  return ((from & 0xff000000) | channel(0) | channel(8) | channel(16)) >>> 0;
}

const stepPaletteCache = new WeakMap<Uint32Array, WeakMap<Uint32Array, readonly Uint32Array[]>>();

/** The lit palette, then one palette per step of light, each that much nearer the moonlit one. */
export function floodlightPalettes(near: Uint32Array, far: Uint32Array): readonly Uint32Array[] {
  let byFar = stepPaletteCache.get(near);
  if (byFar === undefined) {
    byFar = new WeakMap();
    stepPaletteCache.set(near, byFar);
  }
  let palettes = byFar.get(far);
  if (palettes === undefined) {
    palettes = [near, ...FLOODLIGHT.stepShares.map((share) => near.map((c, i) => mixPacked(c, far[i] ?? 0, share)))];
    byFar.set(far, palettes);
  }
  return palettes;
}

/**
 * World x shown by original column `column` at depth `scale` (a layer's scale, between or beyond the layers): the
 * column of world x on a layer of that scale is 14 x scale + 160, less the layer's scroll of camX x scale.
 */
function worldXAt(view: SceneView, column: number, scale: number): number {
  return (view.camX + (column - ORIGINAL_CENTRE_COLUMN) / scale) / ORIGINAL_PX_PER_M;
}

/**
 * Relights rows `top`..`bottom` of a column already drawn in the lit palette: the row at `top` lies at depth
 * `scaleTop`, each row further down `scalePerRow` nearer, and each pixel takes the step of light of the world x
 * it shows there.
 */
function relightColumn(
  c: SceneCanvas,
  h: HillProfile,
  view: SceneView,
  palettes: readonly Uint32Array[],
  sx: number,
  rows: { top: number; bottom: number; scaleTop: number; scalePerRow: number },
): void {
  const { fb, indices } = c;
  const pixels = fb.pixels;
  const column = originalColumn(view, sx);
  const first = Math.max(0, rows.top);
  const end = Math.min(rows.bottom, c.lastRow);
  if (first > end) return;
  const stepAt = (y: number) =>
    floodlightStep(h, worldXAt(view, column, rows.scaleTop + rows.scalePerRow * (y - rows.top)));
  // World x changes one way down a column, so each step covers one run of rows: find where each run ends.
  for (let from = first; from <= end;) {
    const step = stepAt(from);
    let last = from;
    let past = end + 1;
    if (stepAt(end) === step) last = end;
    else {
      while (past - last > 1) {
        const mid = (last + past) >> 1;
        if (stepAt(mid) === step) last = mid;
        else past = mid;
      }
    }
    const pal = palettes[step];
    if (step !== 0 && pal !== undefined) {
      for (let i = from * fb.width + sx; i <= last * fb.width + sx; i += fb.width)
        pixels[i] = pal[indices[i] ?? 0] ?? 0;
    }
    from = last + 1;
  }
}

const FAR_SCALE = LAYER_SCALE[LAYER.farEdge] ?? 1;
const NEAR_SCALE = LAYER_SCALE[LAYER.nearEdge] ?? 1;

/** Rows of the landing hill in a column: from its far edge to its near edge. */
function hillRows(h: HillProfile, view: SceneView, sx: number): [number, number] {
  const t = hillLayerTables(h);
  const far = layerOffset(view, LAYER.farEdge);
  const near = layerOffset(view, LAYER.nearEdge);
  const column = originalColumn(view, sx);
  return [rowsAt(t.farEdge, far.x + column) + far.y, rowsAt(t.nearEdge, near.x + column) + near.y];
}

/**
 * The landing hill by night, after it is drawn in the lit palette: its rows go from the far edge's depth to the
 * near edge's, as the original's colours across it do, and each pixel takes the step of light of the world x
 * it shows. The steps are lines across the hill like its distance lines, fixed to the hill.
 */
export function relightLandingHill(
  c: SceneCanvas,
  h: HillProfile,
  view: SceneView,
  palettes: readonly Uint32Array[],
): void {
  for (let sx = 0; sx < c.fb.width; sx++) {
    const [top, bottom] = hillRows(h, view, sx);
    const scalePerRow = bottom > top ? (NEAR_SCALE - FAR_SCALE) / (bottom - top) : 0;
    relightColumn(c, h, view, palettes, sx, { top, bottom, scaleTop: FAR_SCALE, scalePerRow });
  }
}

/**
 * The snow in front of the near edge by night: it comes nearer by a fixed depth per row, so the steps of the
 * landing hill go on down the picture and turn with the camera as ground does.
 */
export function relightNearGround(c: SceneCanvas, h: HillProfile, view: SceneView, palettes: readonly Uint32Array[]) {
  for (let sx = 0; sx < c.fb.width; sx++) {
    const [, bottom] = hillRows(h, view, sx);
    relightColumn(c, h, view, palettes, sx, {
      top: bottom,
      bottom: c.lastRow,
      scaleTop: NEAR_SCALE,
      scalePerRow: FLOODLIGHT.nearGroundScalePerRow,
    });
  }
}
