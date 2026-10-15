import { FrameBuffer, type Rgb } from "./frame-buffer";
import { currentLookKey, litRgb, skyAt } from "./palette";

/**
 * The palette of the original's jump scene, built as the game builds it (003f:9df1, then 003f:9da5 per hill):
 * thirteen ramps, each from a start colour through a middle colour pulled a little towards grey to an end colour,
 * in 6-bit DAC values. Only the sky ramp (240..255) depends on the hill.
 */

type Rgb6 = readonly [number, number, number];

interface Ramp {
  first: number;
  middle: number;
  last: number;
  from: Rgb6;
  via: Rgb6;
  to: Rgb6;
}

const BLACK: Rgb6 = [0, 0, 2];
const WHITE: Rgb6 = [56, 56, 63];

// oxfmt-ignore
const RAMPS: readonly Ramp[] = [
  { first: 0x00, middle: 0x1f, last: 0x3f, from: BLACK, via: [29, 30, 31], to: WHITE },
  { first: 0x40, middle: 0x4a, last: 0x4f, from: BLACK, via: [63, 10, 10], to: WHITE },
  { first: 0x50, middle: 0x5a, last: 0x5f, from: BLACK, via: [10, 63, 10], to: WHITE },
  { first: 0x60, middle: 0x6a, last: 0x6f, from: BLACK, via: [10, 10, 63], to: WHITE },
  { first: 0x70, middle: 0x7a, last: 0x7f, from: BLACK, via: [63, 63, 10], to: WHITE },
  { first: 0x80, middle: 0x8a, last: 0x8f, from: BLACK, via: [10, 63, 63], to: WHITE },
  { first: 0x90, middle: 0x9a, last: 0x9f, from: BLACK, via: [63, 10, 63], to: WHITE },
  { first: 0xa0, middle: 0xaa, last: 0xaf, from: BLACK, via: [63, 31, 10], to: WHITE },
  { first: 0xb0, middle: 0xba, last: 0xbf, from: BLACK, via: [63, 10, 31], to: WHITE },
  { first: 0xc0, middle: 0xca, last: 0xcf, from: BLACK, via: [63, 45, 0], to: [63, 63, 20] },
  { first: 0xd0, middle: 0xda, last: 0xdf, from: BLACK, via: [31, 10, 63], to: WHITE },
  { first: 0xe0, middle: 0xea, last: 0xef, from: BLACK, via: [31, 31, 31], to: WHITE },
];

/** Sky ramp: from a dark blue at the top through a mix of a light blue and the hill's sky colour to that colour. */
const SKY_TOP: Rgb6 = [25, 25, 60];
const SKY_MIX: Rgb6 = [38, 35, 63];
export const SKY_FIRST_INDEX = 0xf0;

/** The two factors of 2081:00a0, as the 80-bit constants of the original (0.85 and 0.05 rounded up). */
const KEEP = { num: 0xd99999999999999an, shift: 64 };
const GREY = { num: 0xcccccccccccccccdn, shift: 68 };
const MANTISSA_BITS = 64;

/** A dyadic rational num / 2^shift. */
interface Dyadic {
  num: bigint;
  shift: number;
}

/** Rounded to the x87 extended format: 64 significant bits, ties to even. */
function roundExtended(v: Dyadic): Dyadic {
  const bits = v.num.toString(2).length;
  const drop = bits - MANTISSA_BITS;
  if (v.num === 0n || drop <= 0) return v;
  const unit = 1n << BigInt(drop);
  const q = v.num >> BigInt(drop);
  const r = v.num - (q << BigInt(drop));
  const up = 2n * r > unit || (2n * r === unit && (q & 1n) === 1n);
  return { num: (up ? q + 1n : q) << BigInt(drop), shift: v.shift };
}

function add(a: Dyadic, b: Dyadic): Dyadic {
  const shift = Math.max(a.shift, b.shift);
  return { num: (a.num << BigInt(shift - a.shift)) + (b.num << BigInt(shift - b.shift)), shift };
}

/** FISTP: to the nearest integer, ties to even. */
function roundToInteger(v: Dyadic): number {
  const unit = 1n << BigInt(v.shift);
  const q = v.num >> BigInt(v.shift);
  const r = v.num - (q << BigInt(v.shift));
  const up = 2n * r > unit || (2n * r === unit && (q & 1n) === 1n);
  return Number(up ? q + 1n : q);
}

const times = (n: number, k: Dyadic): Dyadic => roundExtended({ num: BigInt(n) * k.num, shift: k.shift });

/** One channel pulled towards grey: round(c * 0.85 + (r + g + b) * 0.05) with the original's rounding. */
function greyed(c: number, sum: number): number {
  return roundToInteger(roundExtended(add(times(c, KEEP), times(sum, GREY)))) & 0xff;
}

/** The middle colour of a ramp, each channel greyed with the channels already greyed before it. */
export function greyedMiddle([r0, g0, b0]: Rgb6): Rgb6 {
  const r = greyed(r0, r0 + g0 + b0);
  const g = greyed(g0, r + g0 + b0);
  const b = greyed(b0, r + g + b0);
  return [r, g, b];
}

/** Pascal `div` on longints: truncation towards zero. */
const div = (a: number, b: number) => Math.trunc(a / b);

/** Step `i` of `n` from `a` to `b`, channel by channel with Pascal's integer division. */
const lerp = (a: Rgb6, b: Rgb6, i: number, n: number): Rgb6 => [
  div((b[0] - a[0]) * i, n) + a[0],
  div((b[1] - a[1]) * i, n) + a[1],
  div((b[2] - a[2]) * i, n) + a[2],
];

function fillRamp(dac: Uint8Array, ramp: Ramp): void {
  const mid = greyedMiddle(ramp.via);
  const set = (i: number, c: Rgb6) => dac.set(c, i * 3);
  const up = ramp.middle - ramp.first;
  for (let i = 0; i <= up; i++) set(ramp.first + i, up === 0 ? ramp.from : lerp(ramp.from, mid, i, up));
  const down = ramp.last - ramp.middle;
  for (let i = 1; i <= down; i++) set(ramp.middle + i, lerp(mid, ramp.to, i, down));
}

/** The whole palette in 6-bit values for a hill whose sky colour (6-bit RGB) is `sky`. */
export function sceneDac(sky: Rgb6): Uint8Array {
  const dac = new Uint8Array(256 * 3);
  for (const ramp of RAMPS) fillRamp(dac, ramp);
  fillRamp(dac, {
    first: SKY_FIRST_INDEX,
    middle: 0xfa,
    last: 0xff,
    from: SKY_TOP,
    via: [(sky[0] + SKY_MIX[0]) >> 1, (sky[1] + SKY_MIX[1]) >> 1, (sky[2] + SKY_MIX[2]) >> 1],
    to: sky,
  });
  return dac;
}

const DAC_LEVELS = 4;
const dacCache = new Map<string, Uint8Array>();
const packedCache = new Map<string, Uint32Array>();

/**
 * Packed colours of a hill's palette under the current look: `far` for the scenery behind the hill (darker and
 * bluer at night, faded in fog), otherwise as for the lit hill.
 */
export function scenePalette(sky: Rgb6, far: boolean): Uint32Array {
  const skyKey = sky.join(",");
  const key = `${currentLookKey()}:${far ? "far" : "near"}:${skyKey}`;
  let pal = packedCache.get(key);
  if (pal === undefined) {
    let dac = dacCache.get(skyKey);
    if (dac === undefined) {
      dac = sceneDac(sky);
      dacCache.set(skyKey, dac);
    }
    pal = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const rgb: Rgb = [
        (dac[i * 3] ?? 0) * DAC_LEVELS,
        (dac[i * 3 + 1] ?? 0) * DAC_LEVELS,
        (dac[i * 3 + 2] ?? 0) * DAC_LEVELS,
      ];
      const setSky = i >= SKY_FIRST_INDEX ? skyAt((i - SKY_FIRST_INDEX) / (255 - SKY_FIRST_INDEX)) : null;
      pal[i] = FrameBuffer.pack(setSky ?? litRgb(rgb, far));
    }
    packedCache.set(key, pal);
  }
  return pal;
}
