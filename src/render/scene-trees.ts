import { BorlandRandom } from "../sim/borland-random";
import type { HillProfile } from "../sim/hill-profile";
import { roundHalfEven } from "../sim/pascal-numeric";
import { f32 } from "../sim/physics-constants";
import { hash } from "./jump-view-camera";
import { hillLayerTables, type LayerTable } from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { backgroundLayerTable } from "./scene-backdrop";
import { LAYER_SCALE, layerOffset, viewColumn, type SceneView } from "./scene-layers";
import { hazedPalette } from "./scene-palette";
import type { SceneCanvas } from "./scene-span";
import { TREE_VARIANTS, treeBitmap, treeHeightPx, treeWidthPx, type TreeBitmap, type TreeKind } from "./tree-bitmaps";

/**
 * Trees of the background as the original places them (0baf:602e, 0baf:0d0c): two kinds, scattered once per hill
 * from its own seed over layers 2..15, each standing on the ground of its layer; the size of a tree is that of a
 * tree about 10 m tall at its layer, the largest size reused on the nearest layers. The original draws one bitmap
 * per size from its Dsj.dat; the trees here are this project's own (`tree-bitmaps.ts`), in the same places and
 * sizes, in a few shapes each, and the farther ones fade a little into the haze.
 */

export interface PlacedTree {
  layer: number;
  kind: TreeKind;
  /** Size 2..12 (the original's sprite for layer `size`). */
  size: number;
  xM: number;
  /** Table index of the tree's x on its layer and its ground in rows. */
  j: number;
  rows: number;
}

/** Share of each count actually placed (an extended 0.8 in the original). */
const COUNT_SHARE = 0.8;
const SIZE_RANGE = 11;
const SMALLEST_SIZE = 2;
const LARGEST_SIZE = 12;
/** Nearest layers of the largest size: 12..14 for spruces, 12..15 for pines. */
const NEAR_LAYERS = { spruce: 3, pine: 4 } as const;
/** Near the takeoff (30 m before it to 20 m past) only the farther layers keep their trees. */
const CLEAR_BEFORE_TAKEOFF_M = 30;
const CLEAR_AFTER_TAKEOFF_M = 20;
const CLEAR_FROM_LAYER = 11;
const MAX_TREES_PER_LAYER = 20;
const X_STEPS_PER_M = 100;

/** Key layers whose ground is a table; others blend the two around them by their scale. */
export const KEY_LAYERS = [1, 2, 4, 7, 11, 17] as const;

function keyTable(h: HillProfile, look: HillLook, layer: number): LayerTable | undefined {
  return layer === 17 ? hillLayerTables(h).farEdge : backgroundLayerTable(h, look, layer);
}

const indexOn = (layer: number, xM: number) => roundHalfEven(xM * 14 * (LAYER_SCALE[layer] ?? 1) + 160);

/** 0baf:0d0c: the index of the key layer at or below `layer` and the ground height there, in rows. */
function groundOf(h: HillProfile, look: HillLook, layer: number, xM: number): { j: number; rows: number } | null {
  for (let k = 0; k < KEY_LAYERS.length - 1; k++) {
    const a = KEY_LAYERS[k] ?? 1;
    const b = KEY_LAYERS[k + 1] ?? 17;
    const ta = keyTable(h, look, a);
    const tb = keyTable(h, look, b);
    if (ta === undefined || tb === undefined) return null;
    const ia = indexOn(a, xM);
    if (layer === a) return { j: ia, rows: ta.height(ia) };
    if (layer > a && layer < b) {
      const pa = LAYER_SCALE[a] ?? 0;
      const f = f32(((LAYER_SCALE[layer] ?? 0) - pa) / ((LAYER_SCALE[b] ?? 1) - pa));
      return { j: ia, rows: f32(ta.height(ia) * (1 - f) + tb.height(indexOn(b, xM)) * f) };
    }
  }
  return null;
}

const placedCache = new WeakMap<HillProfile, Map<HillLook, PlacedTree[]>>();

/** 0baf:602e: the trees of a hill, in the order the original draws them within a layer. */
export function placeTrees(h: HillProfile, look: HillLook): PlacedTree[] {
  let byLook = placedCache.get(h);
  if (byLook === undefined) {
    byLook = new Map();
    placedCache.set(h, byLook);
  }
  const cached = byLook.get(look);
  if (cached !== undefined) return cached;
  const { firstCount, secondCount, fromXM, toXM, seed } = look.trees;
  const rng = new BorlandRandom(seed & 0xffff);
  const trees: PlacedTree[] = [];
  const perLayer = new Map<number, number>();
  const pass = (count: number, kind: TreeKind) => {
    const n = roundHalfEven(count * COUNT_SHARE);
    for (let i = 0; i < n; i++) {
      const size = rng.below(SIZE_RANGE) + SMALLEST_SIZE;
      const layer = size === LARGEST_SIZE ? rng.below(NEAR_LAYERS[kind]) + LARGEST_SIZE : size;
      const x = f32(fromXM + rng.below((toXM - fromXM) * X_STEPS_PER_M) / X_STEPS_PER_M);
      const clear = x >= h.takeoffXM - CLEAR_BEFORE_TAKEOFF_M && x <= h.takeoffXM + CLEAR_AFTER_TAKEOFF_M;
      if (clear && layer >= CLEAR_FROM_LAYER) continue;
      const ground = groundOf(h, look, layer, x);
      if (ground === null || ground.j <= 0) continue;
      const onLayer = perLayer.get(layer) ?? 0;
      if (onLayer >= MAX_TREES_PER_LAYER) continue;
      perLayer.set(layer, onLayer + 1);
      trees.push({ layer, kind, size, xM: x, j: indexOn(layer, x), rows: roundHalfEven(ground.rows) });
    }
  };
  pass(firstCount, "spruce");
  pass(secondCount, "pine");
  // Records the hill's own code moves out of sight (x := -200).
  const shown = trees.filter((t) => {
    const k = trees.filter((o) => o.layer === t.layer).indexOf(t) + 1;
    return !look.trees.hidden.some((r) => r.layer === t.layer && k >= r.first && k <= r.last);
  });
  byLook.set(look, shown);
  return shown;
}

/**
 * Groves around the original's trees (this project's addition): the original scatters single trees evenly, so
 * on the farther layers a few neighbours of the same kind join some of them, a little smaller or of the same size,
 * each standing on its own ground. The original's trees keep their places.
 */
const GROVE_LAST_LAYER = 10;
/** Companions per tree: 0..GROVE_MAX - 1, chosen from the tree's place. */
const GROVE_MAX = 4;
/** Distance of a companion from its tree, in tree widths. */
const GROVE_NEAR_WIDTHS = 0.55;
const GROVE_SPREAD_WIDTHS = 1.1;

const sceneTreeCache = new WeakMap<HillProfile, Map<HillLook, PlacedTree[]>>();

/** The trees drawn for a hill: the original's, each followed by its grove. */
export function sceneTrees(h: HillProfile, look: HillLook): PlacedTree[] {
  let byLook = sceneTreeCache.get(h);
  if (byLook === undefined) {
    byLook = new Map();
    sceneTreeCache.set(h, byLook);
  }
  const cached = byLook.get(look);
  if (cached !== undefined) return cached;
  const trees: PlacedTree[] = [];
  for (const t of placeTrees(h, look)) {
    trees.push(t);
    if (t.layer > GROVE_LAST_LAYER) continue;
    const r = hash(t.j * 31 + t.layer * 977 + (t.kind === "pine" ? 7 : 0));
    const count = r % GROVE_MAX;
    const pxPerM = 14 * (LAYER_SCALE[t.layer] ?? 1);
    const width = treeWidthPx(t.kind, t.size);
    for (let i = 0; i < count; i++) {
      const ri = hash(r + i * 7919);
      const side = (ri & 1) === 0 ? -1 : 1;
      const distance = width * (GROVE_NEAR_WIDTHS + (((ri >>> 1) % 100) / 100) * GROVE_SPREAD_WIDTHS) * (1 + i * 0.6);
      const xM = t.xM + (side * distance) / pxPerM;
      const ground = groundOf(h, look, t.layer, xM);
      if (ground === null || ground.j <= 0) continue;
      const size = Math.max(SMALLEST_SIZE, t.size - ((ri >>> 8) % 2));
      trees.push({ ...t, size, xM, j: indexOn(t.layer, xM), rows: roundHalfEven(ground.rows) });
    }
  }
  byLook.set(look, trees);
  return trees;
}

/** Haze over the farthest trees: this share of the snow's colour at scale 0, none from `HAZE_CLEAR_SCALE` on. */
const HAZE_FAR_SHARE = 0.2;
const HAZE_CLEAR_SCALE = 0.35;
const HAZE_STEPS = 16;
/** Palette index of the snow the haze takes its colour from. */
const HAZE_INDEX = 0x3c;

/** Share of haze on the trees of a layer, in steps of 1/16. */
function hazeShare(layer: number): number {
  const p = LAYER_SCALE[layer] ?? 1;
  const share = Math.max(0, HAZE_FAR_SHARE * (1 - p / HAZE_CLEAR_SCALE));
  return Math.round(share * HAZE_STEPS) / HAZE_STEPS;
}

/** Which of the shapes a tree gets: fixed by where it stands, so it never changes between frames. */
const variantOf = (t: PlacedTree) => hash(t.j * 7 + t.layer * 131 + (t.kind === "pine" ? 1 : 0)) % TREE_VARIANTS;

/** A tree's bitmap with its top left corner at (x0, y0), cut to the scene; index 0 is left out. */
function blit(c: SceneCanvas, pal: Uint32Array, b: TreeBitmap, x0: number, y0: number): void {
  const { fb, indices } = c;
  const pixels = fb.pixels;
  const width = fb.width;
  const fromY = Math.max(0, -y0);
  const toY = Math.min(b.height, c.lastRow - y0 + 1);
  const fromX = Math.max(0, -x0);
  const toX = Math.min(b.width, width - x0);
  for (let y = fromY; y < toY; y++) {
    const source = y * b.width;
    const target = (y0 + y) * width + x0;
    for (let x = fromX; x < toX; x++) {
      const index = b.pixels[source + x] ?? 0;
      if (index === 0) continue;
      indices[target + x] = index;
      pixels[target + x] = pal[index] ?? 0;
    }
  }
}

/** The trees of layers `fromLayer`..`toLayer`, each layer's in the order they were placed. */
export function drawTrees(
  c: SceneCanvas,
  h: HillProfile,
  look: HillLook,
  view: SceneView,
  pal: Uint32Array,
  fromLayer: number,
  toLayer: number,
): void {
  const trees = sceneTrees(h, look);
  for (let layer = fromLayer; layer <= toLayer; layer++) {
    const off = layerOffset(view, layer);
    const layerPal = hazedPalette(pal, HAZE_INDEX, hazeShare(layer));
    for (const t of trees) {
      if (t.layer !== layer) continue;
      // Whether the tree shows at all, before its bitmap is made: most of a hill's trees are out of the view.
      const halfWidth = Math.ceil(treeWidthPx(t.kind, t.size) / view.pixelWidth / 2) + 1;
      const column = viewColumn(view, t.j - off.x);
      const foot = t.rows + off.y;
      if (
        column - halfWidth >= c.fb.width ||
        column + halfWidth < 0 ||
        foot - treeHeightPx(t.kind, t.size) > c.lastRow ||
        foot < 0
      ) {
        continue;
      }
      const b = treeBitmap(t.kind, t.size, view.pixelWidth, variantOf(t));
      blit(c, layerPal, b, column - Math.floor(b.width / 2), foot - b.height + 1);
    }
  }
}
