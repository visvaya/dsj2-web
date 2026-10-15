import { BorlandRandom } from "../sim/borland-random";
import type { HillProfile } from "../sim/hill-profile";
import { roundHalfEven } from "../sim/pascal-numeric";
import { f32 } from "../sim/physics-constants";
import { hash } from "./jump-view-camera";
import { hillLayerTables, type LayerTable } from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { backgroundLayerTable } from "./scene-backdrop";
import { LAYER_SCALE, layerOffset, viewColumn, type SceneView } from "./scene-layers";
import { putIndex, type SceneCanvas } from "./scene-span";

/**
 * Trees of the background as the original places them (0baf:602e, 0baf:0d0c): two kinds, scattered once per hill
 * from its own seed over layers 2..15, each standing on the ground of its layer; the size of a tree is that of a
 * tree about 10 m tall at its layer, the largest size reused on the nearest layers. The original draws bitmaps
 * from its Dsj.dat; the trees here are drawn by this project in the same places and sizes.
 */

export type TreeKind = "spruce" | "pine";

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

/** Height and width in the original's pixels of each size of the two kinds (sizes 2..12). */
// oxfmt-ignore
const TREE_SIZE_PX: Readonly<Record<TreeKind, readonly (readonly [number, number])[]>> = {
  spruce: [[5, 3], [9, 5], [13, 8], [18, 11], [22, 13], [28, 17], [37, 22], [49, 29], [62, 37], [91, 54], [120, 71]],
  pine: [[6, 3], [10, 5], [13, 7], [17, 9], [23, 12], [29, 16], [39, 21], [50, 27], [65, 35], [93, 50], [125, 67]],
};

/** Palette indices: greens from dark to light (0x51..0x55), bark (0xA2..0xA5). */
const GREEN = [0x51, 0x52, 0x53, 0x54, 0x55] as const;
const BARK = [0xa2, 0xa3, 0xa4, 0xa5] as const;

/** A tree as a bitmap of palette indices (0 = nothing), anchored at the middle of its bottom row. */
export interface TreeBitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** A needle colour: mostly the darkest greens, lighter where lit (`light` 0..1) and at random speckles. */
function needle(light: number, r: number): number {
  const speckle = (r % 100) / 100;
  const level = Math.floor(light * 2.2 + speckle * 1.1);
  return GREEN[Math.max(0, Math.min(3, level))] ?? 0x51;
}

function put(b: TreeBitmap, x: number, y: number, index: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const pixels = b.pixels;
  if (xi >= 0 && xi < b.width && yi >= 0 && yi < b.height) pixels[yi * b.width + xi] = index;
}

/** The trunk up the middle from `fromRow` to the bottom, wider for larger trees, lit on its left. */
function trunk(b: TreeBitmap, fromRow: number, dark: number, lit: number): void {
  const mid = Math.round((b.width - 1) / 2);
  const half = b.width >= 30 ? 1 : 0;
  for (let y = fromRow; y < b.height; y++) {
    for (let x = mid - half; x <= mid + half; x++) put(b, x, y, x < mid || half === 0 ? lit : dark);
  }
}

/** A spruce: a cone of drooping tiers with ragged ends, the trunk showing through gaps and at the foot. */
function spruce(width: number, height: number, seed: number): TreeBitmap {
  const b: TreeBitmap = { width, height, pixels: new Uint8Array(width * height) };
  const mid = (width - 1) / 2;
  const foot = Math.max(1, Math.round(height * 0.07));
  const crown = height - foot;
  trunk(b, Math.round(crown * 0.35), BARK[0], BARK[2]);
  const tiers = Math.max(2, Math.round(height / 8));
  for (let y = 0; y < crown; y++) {
    const t = (y + 1) / crown;
    const u = (t * tiers) % 1;
    const rowJitter = (hash(seed + y * 7919) % 3) - 1;
    const half = Math.max(0.5, (mid + 0.5) * Math.pow(t, 0.85) * (0.66 + 0.34 * u) + (width > 12 ? rowJitter : 0));
    for (let x = 0; x < width; x++) {
      const dx = x - mid;
      const r = hash(seed + x * 131 + y * 7919);
      const edge = Math.abs(dx) / half;
      if (edge > 1 || (edge > 0.7 && r % 100 < 55) || (width > 12 && r % 100 < 6)) continue;
      const light = 0.55 * (1 - (dx + half) / (2 * half)) + 0.45 * (1 - u);
      put(b, x, y, needle(light, r >>> 8));
    }
  }
  return b;
}

/** A pine: a tall trunk with branches holding flat, uneven pads of needles in its upper part. */
function pine(width: number, height: number, seed: number): TreeBitmap {
  const b: TreeBitmap = { width, height, pixels: new Uint8Array(width * height) };
  const mid = (width - 1) / 2;
  trunk(b, Math.round(height * 0.04), BARK[1], BARK[3]);
  const pads = Math.max(3, Math.round(height / 7));
  for (let k = 0; k < pads; k++) {
    const r = hash(seed * 31 + k * 977);
    const t = k / Math.max(1, pads - 1);
    const cy = height * (0.06 + 0.6 * t) + ((r >>> 4) % 3) - 1;
    const reach = (mid + 0.5) * (0.25 + 0.75 * Math.sin(Math.PI * (0.1 + 0.8 * t)));
    const side = k % 2 === 0 ? -1 : 1;
    const cx = mid + side * reach * (0.3 + (r % 30) / 100);
    const rx = Math.max(1, reach * (0.6 + ((r >>> 8) % 25) / 100));
    const ry = Math.max(1, height * 0.055 + ((r >>> 16) % 2));
    if (width > 12) {
      for (let i = 0; i <= 8; i++) put(b, mid + (cx - mid) * (i / 8), cy + 2 + (ry * i) / 8, BARK[1]);
    }
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        const n = hash(seed + x * 131 + y * 7919);
        if (d > 1 || (d > 0.55 && n % 100 < 50)) continue;
        const light = 0.5 * (1 - (x - cx + rx) / (2 * rx)) + 0.5 * (1 - (y - cy + ry) / (2 * ry));
        put(b, x, y, needle(light, n >>> 8));
      }
    }
  }
  return b;
}

const bitmapCache = new Map<string, TreeBitmap>();

export function treeBitmap(kind: TreeKind, size: number, pixelWidth: number): TreeBitmap {
  const key = `${kind}:${size}:${pixelWidth}`;
  let bitmap = bitmapCache.get(key);
  if (bitmap === undefined) {
    const [heightPx, widthPx] = TREE_SIZE_PX[kind][size - SMALLEST_SIZE] ?? [10, 6];
    const width = Math.max(1, Math.round(widthPx / pixelWidth));
    const seed = (kind === "spruce" ? 1 : 2) * 1000 + size;
    bitmap = kind === "spruce" ? spruce(width, heightPx, seed) : pine(width, heightPx, seed);
    bitmapCache.set(key, bitmap);
  }
  return bitmap;
}

/** A tree's bitmap with its top left corner at (x0, y0); index 0 is left out. */
function blit(c: SceneCanvas, pal: Uint32Array, b: TreeBitmap, x0: number, y0: number): void {
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const index = b.pixels[y * b.width + x] ?? 0;
      if (index !== 0) putIndex(c, pal, x0 + x, y0 + y, index);
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
  const trees = placeTrees(h, look);
  for (let layer = fromLayer; layer <= toLayer; layer++) {
    const off = layerOffset(view, layer);
    for (const t of trees) {
      if (t.layer !== layer) continue;
      const b = treeBitmap(t.kind, t.size, view.pixelWidth);
      const x0 = viewColumn(view, t.j - off.x) - Math.floor(b.width / 2);
      const y0 = t.rows + off.y - b.height + 1;
      if (x0 >= c.fb.width || x0 + b.width < 0 || y0 > c.lastRow || y0 + b.height < 0) continue;
      blit(c, pal, b, x0, y0);
    }
  }
}
