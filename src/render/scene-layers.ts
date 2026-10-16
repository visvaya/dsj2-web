import { f32 } from "../sim/physics-constants";
import { roundHalfEven, truncToInt } from "../sim/pascal-numeric";

/**
 * The original draws its scene as layers in perspective (0baf:344c): layer i shows the world scaled by
 * `LAYER_SCALE[i]` around a vanishing point near the top of the screen, so far layers move slowly and near ones
 * fast. Everything here is in the original's screen units: 320 columns at 14 px/m and 200 rows at 14*200/240
 * px/m; the view maps its own columns onto these (`originalColumn`).
 */

/** Scale of each layer (float32 table at DS:14EE of v2.10P). */
// oxfmt-ignore
export const LAYER_SCALE: readonly number[] = [
  0.014285714365541935, 0.009999999776482582, 0.03229999914765358, 0.06840000301599503, 0.08950000256299973,
  0.11699999868869781, 0.15299999713897705, 0.20000000298023224, 0.2619999945163727, 0.34200000762939453,
  0.4399999976158142, 0.5860000252723694, 0.6258823275566101, 0.6734177470207214, 0.7287670969963074,
  0.7940298318862915, 0.8721311688423157, 0.9333333373069763, 1.100000023841858, 1.1822222471237183,
  1.3300000429153442, 1.5199999809265137, 2, 2.3130435943603516, 2.799999952316284,
];

/** The layers the hill itself is made of. */
export const LAYER = {
  /** Far edge of the landing hill, with the far fence. */
  farEdge: 17,
  /** Far side of the inrun trough. */
  inrunFar: 19,
  /** The plane the jumper moves in. */
  jumper: 20,
  /** Near side of the inrun trough. */
  inrunNear: 21,
  /** Near edge of the landing hill, with the near fence. */
  nearEdge: 23,
} as const;

/** Horizontal and vertical pixels per metre at scale 1 on the original's screen. */
export const ORIGINAL_PX_PER_M = 14;
export const ORIGINAL_ROW_PX_PER_M = (14 * 200) / 240;
/** The original's centre column (table index 160 is x = 0). */
export const ORIGINAL_CENTRE_COLUMN = 160;
/** Camera of 0baf:344c: the jumper sits 9 px left of the centre and 70 rows below the horizon line at scale 1. */
const CAMERA_LEAD_PX = 9;
const CAMERA_DROP_PX = 70;
/** Row the layers converge on: yoff = trunc(camY * p - 12 * (p - 1)). */
const VANISHING_ROW = 12;

/**
 * Where the view looks: the camera in the original's pixels and how the view's columns map onto the original's.
 * `pixelWidth` is the width of one view column in original columns (1 for the original's own screen, 6/5 for
 * square pixels at the original's height).
 */
export interface SceneView {
  widthPx: number;
  pixelWidth: number;
  camX: number;
  camY: number;
}

export function sceneView(jumperXM: number, jumperYM: number, widthPx: number, pixelWidth: number): SceneView {
  return {
    widthPx,
    pixelWidth,
    camX: f32(jumperXM * ORIGINAL_PX_PER_M + CAMERA_LEAD_PX),
    camY: f32((jumperYM * ORIGINAL_PX_PER_M * 200) / 240 + CAMERA_DROP_PX),
  };
}

/** The original's column shown by view column `sx` (the centre columns coincide). */
export function originalColumn(view: SceneView, sx: number): number {
  return Math.floor((sx - view.widthPx / 2) * view.pixelWidth) + ORIGINAL_CENTRE_COLUMN;
}

/** The view column that shows the original's column `column` (inverse of `originalColumn`, rounded). */
export function viewColumn(view: SceneView, column: number): number {
  return Math.round((column - ORIGINAL_CENTRE_COLUMN) / view.pixelWidth + view.widthPx / 2);
}

/** Width of a square pixel in the original's columns: its 320 columns span the width of 4:3 at 200 rows. */
export const SQUARE_PIXEL_WIDTH = 6 / 5;

/** Scroll of a layer: table index of column 0 and the row of height 0. */
export interface LayerOffset {
  x: number;
  y: number;
}

export function layerOffset(view: SceneView, layer: number): LayerOffset {
  const p = LAYER_SCALE[layer] ?? 1;
  return {
    x: truncToInt(view.camX * p),
    y: truncToInt(view.camY * p - VANISHING_ROW * (p - 1)),
  };
}

/** World x of table index `j` of a layer (the original keeps it as a Single). */
export function layerX(layer: number, j: number): number {
  const p = LAYER_SCALE[layer] ?? 1;
  return f32(f32((j - ORIGINAL_CENTRE_COLUMN) / ORIGINAL_PX_PER_M) / p);
}

/** Table index of world x on a layer, as the original stores marks and fences: round(14 p x) + 160. */
export function layerIndex(layer: number, xM: number): number {
  const p = LAYER_SCALE[layer] ?? 1;
  return roundHalfEven(xM * ORIGINAL_PX_PER_M * p) + ORIGINAL_CENTRE_COLUMN;
}

/** Table value of a height on a layer: -round(14 p y 200/240), rows up from the layer's offset. */
export function layerRows(layer: number, yM: number): number {
  const p = LAYER_SCALE[layer] ?? 1;
  return -roundHalfEven((ORIGINAL_PX_PER_M * p * yM * 200) / 240);
}
