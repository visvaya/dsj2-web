import { hash } from "./jump-view-camera";

/**
 * This project's own trees for the background, in the sizes of the original's bitmaps: snow-laden spruces with
 * drooping tiers and pines with a bare orange trunk under a crown of flat clumps. Each size comes in a few
 * shapes, so neighbouring trees differ (the original repeats one bitmap per size). Light comes from the upper
 * left; snow lies on the tops of the branches.
 */

export type TreeKind = "spruce" | "pine";

/** A tree as a bitmap of palette indices (0 = nothing), anchored at the middle of its bottom row. */
export interface TreeBitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** Shapes drawn for each kind and size. */
export const TREE_VARIANTS = 4;
const SMALLEST_TREE_SIZE = 2;

/** Height and width in the original's pixels of each size of the two kinds (sizes 2..12). */
// oxfmt-ignore
const TREE_SIZE_PX: Readonly<Record<TreeKind, readonly (readonly [number, number])[]>> = {
  spruce: [[5, 3], [9, 5], [13, 8], [18, 11], [22, 13], [28, 17], [37, 22], [49, 29], [62, 37], [91, 54], [120, 71]],
  pine: [[6, 3], [10, 5], [13, 7], [17, 9], [23, 12], [29, 16], [39, 21], [50, 27], [65, 35], [93, 50], [125, 67]],
};

/** Width in the original's columns of a tree of `kind` and `size`. */
export function treeWidthPx(kind: TreeKind, size: number): number {
  return TREE_SIZE_PX[kind][size - SMALLEST_TREE_SIZE]?.[1] ?? 6;
}

/** Height in rows of a tree of `kind` and `size`. */
export function treeHeightPx(kind: TreeKind, size: number): number {
  return TREE_SIZE_PX[kind][size - SMALLEST_TREE_SIZE]?.[0] ?? 10;
}

/** Palette indices: needles from the darkest green up (0x51..0x56), bark, snow in light and in shade. */
const GREEN = [0x51, 0x52, 0x53, 0x54, 0x55, 0x56] as const;
const GREEN_FIRST = 0x51;
const GREEN_LAST = 0x56;
/** Needle colour `level` (0 darkest .. 5 lightest). */
const green = (level: number): number => GREEN[Math.max(0, Math.min(GREEN.length - 1, level))] ?? GREEN_FIRST;
const SPRUCE_BARK = { lit: 0xa3, shade: 0xa1 } as const;
const PINE_BARK = { lit: 0xa6, shade: 0xa4, low: 0xa2 } as const;
const SNOW = { lit: 0x3f, shade: 0x3a } as const;
/** Trees at least this tall carry snow. */
const SNOW_FROM_HEIGHT_PX = 12;
/** Pines shorter than this get the compact crown of a far tree. */
const COMPACT_PINE_BELOW_PX = 30;

/** A needle colour for a light level (0 dark .. 1 lit), with a speckle of noise `r`. */
function needle(light: number, r: number): number {
  return green(Math.floor(light * 3.8 + ((r % 100) / 100) * 1.3 - 0.9));
}

/** A random number in 0..1 from a seed and a key. */
const unit = (seed: number, key: number) => hash(seed * 7919 + key * 104729) / 0x1_0000_0000;

function put(b: TreeBitmap, x: number, y: number, index: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const pixels = b.pixels;
  if (xi >= 0 && xi < b.width && yi >= 0 && yi < b.height) pixels[yi * b.width + xi] = index;
}

const at = (b: TreeBitmap, x: number, y: number) =>
  x >= 0 && x < b.width && y >= 0 && y < b.height ? (b.pixels[y * b.width + x] ?? 0) : 0;

const isNeedle = (i: number) => i >= GREEN_FIRST && i <= GREEN_LAST;

/**
 * Snow on the tops of branches: a needle pixel with open air above it and needles under it turns white, on the
 * lit side mostly, on the shaded side now and then; the needles under it keep it apart from the snow behind.
 */
function snowOnTops(b: TreeBitmap, seed: number, fromRow: number): void {
  const mid = (b.width - 1) / 2;
  for (let y = fromRow; y < b.height - 1; y++) {
    for (let x = 0; x < b.width; x++) {
      if (!isNeedle(at(b, x, y)) || at(b, x, y - 1) !== 0 || !isNeedle(at(b, x, y + 1))) continue;
      const r = unit(seed, x * 977 + y * 31);
      const shaded = x > mid + 0.5;
      if (r < (shaded ? 0.35 : 0.7)) put(b, x, y, shaded ? SNOW.shade : SNOW.lit);
    }
  }
}

/** A vertical trunk of `half` pixels each side of the middle from `fromRow` down, lit on its left. */
function trunk(
  b: TreeBitmap,
  fromRow: number,
  half: number,
  colour: (y: number, lit: boolean) => number,
  lean: (y: number) => number = () => 0,
): void {
  for (let y = Math.max(0, fromRow); y < b.height; y++) {
    const mid = Math.round((b.width - 1) / 2 + lean(y));
    for (let x = mid - half; x <= mid + half; x++) put(b, x, y, colour(y, x < mid || half === 0));
  }
}

/** The smallest spruces: a plain cone with a lit left side and, from 9 px, one notch between two tiers. */
function smallSpruce(b: TreeBitmap, seed: number): void {
  const mid = (b.width - 1) / 2;
  const crown = b.height - 1;
  trunk(b, crown, 0, () => SPRUCE_BARK.shade);
  for (let y = 0; y < crown; y++) {
    const t = (y + 1) / crown;
    const notch = b.height >= 9 && Math.abs(t - 0.55) < 0.1 ? 0.7 : 1;
    const half = (mid + 0.5) * t * notch;
    for (let x = 0; x < b.width; x++) {
      const dx = x - mid;
      if (Math.abs(dx) > half) continue;
      put(b, x, y, dx < 0 ? green(3) : dx > 0 ? green(0) : green(1 + Math.round(unit(seed, y))));
    }
  }
}

/** One column of a spruce's branch, `dx` from the trunk on `side`, from row `top` to `bottom`. */
function branchColumn(
  b: TreeBitmap,
  p: { seed: number; k: number; side: -1 | 1; dx: number; u: number; top: number; bottom: number; mid: number },
): void {
  const { seed, k, side, dx, u, top, bottom } = p;
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
    const n = unit(seed, dx * 131 + y * 17 + side * 7 + k * 3);
    const depth = (y - top) / Math.max(1, bottom - top);
    // Ragged tips and a lacy lower edge.
    const ragged = (u > 0.8 && n < (u - 0.8) * 3) || (depth > 0.75 && n < 0.45);
    const gap = b.width >= 20 && u > 0.2 && u < 0.7 && n < 0.04;
    if (ragged || gap) continue;
    const light = (1 - depth) * 0.85 + (side < 0 ? 0.25 : 0) - (u < 0.25 ? 0.3 : 0);
    put(b, p.mid + side * dx, y, needle(light, hash(seed + dx * 31 + y * 7 + k)));
  }
}

/**
 * A spruce: a narrow cone of branches that leave the trunk and droop towards their tips, each with a curtain of
 * needles hanging under it; the upper branches overlap the lower ones. Tips are ragged and a few gaps show the
 * trunk.
 */
function spruce(width: number, height: number, seed: number): TreeBitmap {
  const b: TreeBitmap = { width, height, pixels: new Uint8Array(width * height) };
  if (height < 12) {
    smallSpruce(b, seed);
    return b;
  }
  const mid = (width - 1) / 2;
  const foot = Math.max(1, Math.round(height * 0.05));
  const crown = height - foot;
  trunk(b, Math.round(crown * 0.2), width >= 40 ? 1 : 0, (_, lit) => (lit ? SPRUCE_BARK.lit : SPRUCE_BARK.shade));
  const tiers = Math.max(3, Math.round(crown / (4.5 + height / 45)));
  const tierRows = crown / tiers;
  // Bottom tier first: each tier above hangs over the one below.
  for (let k = tiers - 1; k >= 0; k--) {
    const base = (k + 0.15 + 0.25 * unit(seed, k)) * tierRows;
    for (const side of [-1, 1] as const) {
      const r = unit(seed, k * 2 + (side > 0 ? 1 : 0) + 100);
      const tip = Math.min(1, (base + tierRows * 0.9) / crown);
      const reach = Math.max(1, (mid + 0.5) * Math.pow(tip, 0.95) * (0.68 + 0.38 * r));
      const droop = tierRows * (0.7 + 0.5 * unit(seed, k + 300 + side));
      const thick = Math.max(1, tierRows * 0.45);
      const hang = tierRows * (0.35 + 0.3 * unit(seed, k + 500 - side));
      for (let dx = 0; dx <= Math.ceil(reach); dx++) {
        const u = dx / reach;
        const centre = base + droop * Math.pow(u, 1.7);
        const top = centre - thick * (1 - 0.6 * u);
        const bottom = centre + thick * 0.3 + hang * Math.sin(Math.PI * Math.min(1, u * 1.15));
        branchColumn(b, { seed, k, side, dx, u, top, bottom, mid });
      }
    }
  }
  // The leader at the very top.
  for (let y = 0; y < Math.max(2, Math.round(tierRows * 0.8)); y++) put(b, mid, y, green(2));
  snowOnTops(b, seed, 1);
  return b;
}

/** The smallest pines: a short trunk under a wide, flat-topped crown, lit on its left. */
function smallPine(b: TreeBitmap, seed: number): void {
  const mid = (b.width - 1) / 2;
  const crown = Math.max(2, Math.round(b.height * 0.62));
  trunk(b, crown - 1, 0, () => PINE_BARK.low);
  for (let y = 0; y < crown; y++) {
    // Full width from the second row, a little narrower at the bottom of the crown.
    const half = y === 0 ? mid * 0.5 : y === crown - 1 && crown > 2 ? mid * 0.7 : mid + 0.5;
    for (let x = 0; x < b.width; x++) {
      const dx = x - mid;
      if (Math.abs(dx) > half) continue;
      put(b, x, y, dx < 0 || y === 0 ? green(3) : green(unit(seed, x + y * 7) < 0.5 ? 0 : 1));
    }
  }
}

/**
 * A pine seen from afar: a short trunk under a dense crown of a few overlapping lumps, flat on top and lit on its
 * left; too small for the clumps of a near pine, which would leave only a stick.
 */
function compactPine(b: TreeBitmap, seed: number): void {
  const mid = (b.width - 1) / 2;
  const crown = Math.round(b.height * (0.6 + 0.08 * unit(seed, 1)));
  trunk(b, Math.round(crown * 0.4), 0, (y) => (y < crown ? PINE_BARK.shade : PINE_BARK.low));
  const lumps = 3 + Math.round(unit(seed, 2));
  for (let k = 0; k < lumps; k++) {
    const t = lumps === 1 ? 0 : k / (lumps - 1);
    const cx = mid + (unit(seed, k + 10) - 0.5) * b.width * 0.3;
    const cy = crown * (0.2 + 0.55 * t);
    const rx = Math.max(1.2, (mid + 0.5) * (0.55 + 0.25 * unit(seed, k + 20)));
    const ry = Math.max(1, crown * (0.22 + 0.06 * unit(seed, k + 30)));
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const vy = (y - cy) / ry;
        const d = ((x - cx) / rx) ** 2 + (vy < 0 ? vy * vy * 1.6 : vy * vy);
        if (d > 1 || (d > 0.7 && unit(seed, x * 131 + y * 17 + k) < 0.4)) continue;
        const light = 0.6 * (1 - (vy + 1) / 2) + 0.4 * (1 - (x - cx + rx) / (2 * rx));
        put(b, x, y, needle(light, hash(seed + x * 31 + y * 7 + k)));
      }
    }
  }
}

/**
 * A pine: a tall trunk, orange in the crown and grey-brown below, with a few dead stubs; the crown is a loose
 * umbrella of small flat clumps of needles along short branches, with sky between them.
 */
function pine(width: number, height: number, seed: number): TreeBitmap {
  const b: TreeBitmap = { width, height, pixels: new Uint8Array(width * height) };
  if (height < 12) {
    smallPine(b, seed);
    return b;
  }
  if (height < COMPACT_PINE_BELOW_PX) {
    compactPine(b, seed);
    snowOnTops(b, seed, 0);
    return b;
  }
  const centre = (width - 1) / 2;
  // An old pine: the crown in the upper part, leaning a little to one side, the trunk bending with it.
  const crownTop = height * 0.03;
  const crownBottom = height * (0.55 + 0.1 * unit(seed, 1));
  const tilt = (unit(seed, 3) - 0.5) * width * 0.16;
  const lean = (y: number) => tilt * Math.pow(1 - y / height, 1.6);
  const mid = (y: number) => centre + lean(y);
  const favoured = unit(seed, 4) < 0.5 ? -1 : 1;
  trunk(
    b,
    Math.round(crownTop + 2),
    width >= 30 ? 1 : 0,
    (y, lit) => {
      if (y > crownBottom + height * 0.12) return lit ? PINE_BARK.shade : PINE_BARK.low;
      return lit ? PINE_BARK.lit : PINE_BARK.shade;
    },
    lean,
  );
  // Dead stubs on the bare trunk.
  for (let k = 0; k < Math.round(height / 22); k++) {
    const y = Math.round(crownBottom + (height - crownBottom) * (0.08 + 0.5 * unit(seed, k + 40)));
    const side = unit(seed, k + 50) < 0.5 ? -1 : 1;
    const len = 1 + Math.round(width * 0.05);
    for (let i = 1; i <= len; i++) put(b, mid(y) + side * i, y - Math.round(i / 2), PINE_BARK.low);
  }
  const clumpRx = Math.max(1.5, width * ((height < 45 ? 0.27 : 0.14) + 0.04 * unit(seed, 2)));
  const clump = (cx: number, cy: number, rx: number, k: number) => {
    const ry = Math.max(1, rx * (0.5 + 0.2 * unit(seed, k + 500)));
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const vy = (y - cy) / ry;
        // Flat on top, rounded underneath, ragged at the rim.
        const d = ((x - cx) / rx) ** 2 + (vy < 0 ? vy * vy * 1.8 : vy * vy);
        const n = unit(seed, x * 131 + y * 17 + k * 5);
        if (d > 1 || (d > 0.5 && n < 0.5)) continue;
        const light = 0.6 * (1 - (vy + 1) / 2) + 0.4 * (1 - (x - cx + rx) / (2 * rx));
        put(b, x, y, needle(light, hash(seed + x * 31 + y * 7 + k)));
      }
    }
  };
  const levels = Math.max(3, Math.round((crownBottom - crownTop) / Math.max(3, clumpRx * 0.8)));
  for (let k = 0; k < levels; k++) {
    const t = (k + 0.5) / levels;
    const y = crownTop + (crownBottom - crownTop) * t;
    const m = mid(y);
    // Widest in the upper half of the crown, thinning out towards its bottom.
    const shape = 0.35 + 0.65 * Math.sin(Math.PI * (0.18 + 0.7 * t));
    for (const side of [-1, 1] as const) {
      const r = unit(seed, k * 2 + (side > 0 ? 1 : 0) + 200);
      // Branches on both sides, a few missing low in the crown.
      if (t > 0.6 && r < 0.3 * t * t) continue;
      const room = (side < 0 ? m : width - 1 - m) + 0.5 - clumpRx * 1.1;
      const bias = side === favoured ? 1 : 0.88;
      const len = Math.max(1, room * shape * bias * (0.85 + 0.15 * unit(seed, k * 2 + side + 300)));
      const tipX = m + side * len;
      const tipY = y - len * (0.15 + 0.25 * unit(seed, k + 350));
      const steps = Math.ceil(len);
      for (let i = 0; i <= steps; i++) {
        const u = i / Math.max(1, steps);
        put(b, m + (tipX - m) * u, y + (tipY - y) * u + 1, PINE_BARK.shade);
      }
      const rx = Math.min(clumpRx * (0.7 + 0.6 * unit(seed, k * 2 + side + 400)), room + clumpRx * 1.1 - len);
      clump(tipX, tipY, rx, k * 2 + (side > 0 ? 1 : 0));
      if (len > rx * 1.2) clump(m + (tipX - m) * 0.45, y + (tipY - y) * 0.45 - 1, rx * 0.85, k * 2 + 50);
    }
  }
  clump(mid(crownTop) + favoured * clumpRx * 0.3, crownTop + clumpRx * 0.4, clumpRx, 99);
  snowOnTops(b, seed, 0);
  return b;
}

const bitmapCache = new Map<string, TreeBitmap>();

/** The bitmap of a tree of `kind` and `size` (2..12) in shape `variant`, columns `pixelWidth` original columns wide. */
export function treeBitmap(kind: TreeKind, size: number, pixelWidth: number, variant = 0): TreeBitmap {
  const key = `${kind}:${size}:${pixelWidth}:${variant}`;
  let bitmap = bitmapCache.get(key);
  if (bitmap === undefined) {
    const [heightPx, widthPx] = TREE_SIZE_PX[kind][size - SMALLEST_TREE_SIZE] ?? [10, 6];
    const width = Math.max(1, Math.round(widthPx / pixelWidth));
    const seed = (kind === "spruce" ? 1 : 2) * 1000 + size * 10 + variant;
    bitmap = kind === "spruce" ? spruce(width, heightPx, seed) : pine(width, heightPx, seed);
    if (heightPx < SNOW_FROM_HEIGHT_PX) bitmap = withoutSnow(bitmap);
    bitmapCache.set(key, bitmap);
  }
  return bitmap;
}

function withoutSnow(b: TreeBitmap): TreeBitmap {
  return { ...b, pixels: b.pixels.map((i) => (i === SNOW.lit || i === SNOW.shade ? green(3) : i)) };
}
