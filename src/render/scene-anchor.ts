import { inrunYM, type HillProfile } from "../sim/hill-profile";
import { truncToInt } from "../sim/pascal-numeric";
import { rowsAt, type LayerTable } from "./hill-layer-tables";
import {
  ORIGINAL_CENTRE_COLUMN,
  ORIGINAL_PX_PER_M,
  layerIndex,
  layerOffset,
  layerRows,
  layerX,
  nearestViewColumn,
  originalColumn,
  sceneView,
  viewColumn,
  type SceneView,
} from "./scene-layers";

/**
 * Where a thing of the world is put on the picture. Every thing belongs to one of four places, and moves only
 * as that place does:
 *
 * - on a drawn layer surface (a fence, a rail, an edge of the hill): the column nearest to its table index and
 *   the row the surface is drawn at under that column, so it stays on what is drawn under it as the picture
 *   scrolls (`onSurface`, `onSurfaceAtHeight`);
 * - on a layer of the background, moving with that layer's scroll (`layerPlacer`, `layerScroll`);
 * - in the sky, moving only with the stars' slow drift (`skyDrift`);
 * - on the screen itself (the interface): fixed to the picture, with no world under it.
 *
 * The surfaces themselves are drawn column by column from the layer tables (`scene-layers.ts`,
 * `hill-layer-tables.ts`); a thing placed any other way than here drifts against the surface it belongs to.
 */

/** A place on the picture: view column and row. */
export type ScreenPoint = [number, number];

/**
 * A thing at world x standing on what is drawn of a layer: the view column nearest to its table index, and the
 * row of the table at the index that column shows, so it stays on the fence or the rail under it as the picture
 * scrolls instead of moving a row against it where the view skips its own index.
 */
export function onSurface(view: SceneView, layer: number, table: LayerTable, xM: number): ScreenPoint {
  const off = layerOffset(view, layer);
  const sx = nearestViewColumn(view, layerIndex(layer, xM) - off.x);
  return [sx, rowsAt(table, off.x + originalColumn(view, sx)) + off.y];
}

/**
 * A point at world (x, y) of a layer drawn against its surface: at its own height where the view shows its table
 * index, and otherwise in the nearest column shown, up or down by as much as the surface is there, so it keeps its
 * place against the surface as the picture scrolls.
 */
export function onSurfaceAtHeight(
  view: SceneView,
  layer: number,
  table: LayerTable,
  xM: number,
  yM: number,
): ScreenPoint {
  const off = layerOffset(view, layer);
  const j = layerIndex(layer, xM);
  const sx = nearestViewColumn(view, j - off.x);
  const shown = off.x + originalColumn(view, sx);
  return [sx, layerRows(layer, yM) + off.y + rowsAt(table, shown) - rowsAt(table, j)];
}

/**
 * A point of the start gate at world (x, y) of a layer, as the original places it on its own screen: the rounded
 * column of its table index and its exact row. Only the start gate is placed so (the guard test allows it in
 * `scene-inrun.ts` alone): a thing standing on a drawn surface placed this way moves a row against it.
 */
export function gatePlace(view: SceneView, layer: number, xM: number, yM: number): ScreenPoint {
  const off = layerOffset(view, layer);
  return [viewColumn(view, layerIndex(layer, xM) - off.x), layerRows(layer, yM) + off.y];
}

/**
 * Places on a layer of the background for one view: a thing at table index `j` with its foot `rows` rows from the
 * layer's row of height 0 (as the original keeps its trees).
 */
export function layerPlacer(view: SceneView, layer: number): (j: number, rows: number) => ScreenPoint {
  const off = layerOffset(view, layer);
  return (j, rows) => [viewColumn(view, j - off.x), rows + off.y];
}

/** The scroll of a layer in the picture's columns and rows: a thing on it moves on the picture against this. */
export function layerScroll(view: SceneView, layer: number): { x: number; y: number } {
  const off = layerOffset(view, layer);
  return { x: off.x / view.pixelWidth, y: off.y };
}

/** World x of the stretch of a layer the view shows, from `marginPx` columns left of it to as far right of it. */
export function layerSpanXM(view: SceneView, layer: number, marginPx: number): [number, number] {
  const off = layerOffset(view, layer);
  return [
    layerX(layer, off.x + originalColumn(view, -marginPx)),
    layerX(layer, off.x + originalColumn(view, view.widthPx + marginPx)),
  ];
}

/**
 * World x shown by original column `column` at depth `scale` (a layer's scale, between or beyond the layers): the
 * column of world x on a layer of that scale is 14 x scale + 160, less the layer's scroll, which is camX x scale
 * cut to whole columns as the layers' own scroll is, so what is placed by it keeps to the column the hill has there.
 */
export function worldXAtDepth(view: SceneView, column: number, scale: number): number {
  return (truncToInt(view.camX * scale) + column - ORIGINAL_CENTRE_COLUMN) / (scale * ORIGINAL_PX_PER_M);
}

/** Stars move with the farthest layer. */
const STAR_DRIFT = 0.01;

/** Columns the sky has drifted for a view: a thing of the sky at sky column `c` shows at `c - skyDrift(view)`. */
export function skyDrift(view: SceneView): number {
  return Math.round(view.camX * STAR_DRIFT);
}

/** The same picture with the camera where the jumper stands at the start, for places chosen once per jump. */
export function viewAtStart(h: HillProfile, view: SceneView): SceneView {
  return sceneView(h.startXM, inrunYM(h, h.startXM), view.widthPx, view.pixelWidth);
}
