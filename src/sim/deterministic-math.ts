/**
 * Transcendental functions with the same result on every JavaScript engine.
 *
 * ECMAScript leaves Math.sin, Math.cos, Math.atan and Math.exp
 * implementation-approximated, so browsers may differ in the last bits and a
 * replay could end a few centimetres apart on two devices. These functions
 * follow the algorithms of fdlibm 5.3 (Sun Microsystems) using only IEEE 754
 * double operations (+, -, *, /, comparisons), which every engine performs
 * identically. Math.sqrt is correctly rounded by IEEE 754 and is used as is.
 *
 * Arguments are limited to |x| < 2^19 * pi/2 for sin and cos; the game never
 * comes close, and a RangeError is clearer than a silently imprecise result.
 */

const view = new DataView(new ArrayBuffer(8));

function highWord(x: number): number {
  view.setFloat64(0, x, true);
  return view.getInt32(4, true);
}

function withHighWord(x: number, high: number): number {
  view.setFloat64(0, x, true);
  view.setInt32(4, high, true);
  return view.getFloat64(0, true);
}

function fromWords(high: number, low: number): number {
  view.setInt32(4, high, true);
  view.setUint32(0, low >>> 0, true);
  return view.getFloat64(0, true);
}

// sin/cos kernels on [-pi/4, pi/4]
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kernelSin(x: number, y: number, hasTail: boolean): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) {
    return x;
  }
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (!hasTail) {
    return x + v * (S1 + z * r);
  }
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) {
    return 1;
  }
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) {
    return 1 - (0.5 * z - (z * r - x * y));
  }
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

// Argument reduction x = n * pi/2 + (y0 + y1)
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const MEDIUM_LIMIT_HIGH_WORD = 0x413921fb;

interface Reduced {
  n: number;
  y0: number;
  y1: number;
}

function remPio2(x: number): Reduced {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    return { n: 0, y0: x, y1: 0 };
  }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3ff921fb) {
        const y0 = z - PIO2_1T;
        return { n: 1, y0, y1: z - y0 - PIO2_1T };
      }
      z -= PIO2_2;
      const y0 = z - PIO2_2T;
      return { n: 1, y0, y1: z - y0 - PIO2_2T };
    }
    let z = x + PIO2_1;
    if (ix !== 0x3ff921fb) {
      const y0 = z + PIO2_1T;
      return { n: -1, y0, y1: z - y0 + PIO2_1T };
    }
    z += PIO2_2;
    const y0 = z + PIO2_2T;
    return { n: -1, y0, y1: z - y0 + PIO2_2T };
  }
  if (ix > MEDIUM_LIMIT_HIGH_WORD) {
    throw new RangeError(`trigonometric argument out of range: ${x}`);
  }
  const t = Math.abs(x);
  const n = Math.trunc(t * INV_PIO2 + 0.5);
  const fn = n;
  let r = t - fn * PIO2_1;
  let w = fn * PIO2_1T;
  // fdlibm skips the cancellation check below for most arguments via a
  // lookup table; running it always gives the same result.
  const j = ix >> 20;
  let y0 = r - w;
  let i = j - ((highWord(y0) >> 20) & 0x7ff);
  if (i > 16) {
    let tt = r;
    w = fn * PIO2_2;
    r = tt - w;
    w = fn * PIO2_2T - (tt - r - w);
    y0 = r - w;
    i = j - ((highWord(y0) >> 20) & 0x7ff);
    if (i > 49) {
      tt = r;
      w = fn * PIO2_3;
      r = tt - w;
      w = fn * PIO2_3T - (tt - r - w);
      y0 = r - w;
    }
  }
  const y1 = r - y0 - w;
  return hx < 0 ? { n: -n, y0: -y0, y1: -y1 } : { n, y0, y1 };
}

export function detSin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    return kernelSin(x, 0, false);
  }
  if (ix >= 0x7ff00000) {
    return Number.NaN;
  }
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelSin(y0, y1, true);
    case 1:
      return kernelCos(y0, y1);
    case 2:
      return -kernelSin(y0, y1, true);
    default:
      return -kernelCos(y0, y1);
  }
}

export function detCos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    return kernelCos(x, 0);
  }
  if (ix >= 0x7ff00000) {
    return Number.NaN;
  }
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelCos(y0, y1);
    case 1:
      return -kernelSin(y0, y1, true);
    case 2:
      return -kernelCos(y0, y1);
    default:
      return kernelSin(y0, y1, true);
  }
}

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
] as const;

export function detAtan(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (Number.isNaN(x)) {
      return x;
    }
    return hx > 0 ? ATAN_HI[3]! + ATAN_LO[3]! : -ATAN_HI[3]! - ATAN_LO[3]!;
  }
  let id: number;
  let v = x;
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) {
      return x;
    }
    id = -1;
  } else {
    v = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        v = (2 * v - 1) / (2 + v);
      } else {
        id = 1;
        v = (v - 1) / (v + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      v = (v - 1.5) / (1 + 1.5 * v);
    } else {
      id = 3;
      v = -1 / v;
    }
  }
  const z = v * v;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    return v - v * (s1 + s2);
  }
  const r = ATAN_HI[id]! - (v * (s1 + s2) - ATAN_LO[id]! - v);
  return hx < 0 ? -r : r;
}

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;
const EXP_OVERFLOW = 7.09782712893383973096e2;
const EXP_UNDERFLOW = -7.45133219101941108420e2;
const TWO_POW_MINUS_1000 = 9.33263618503218878990e-302;

export function detExp(x: number): number {
  const word = highWord(x);
  const negative = word < 0;
  const hx = word & 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (Number.isNaN(x)) {
        return x;
      }
      return negative ? 0 : x;
    }
    if (x > EXP_OVERFLOW) {
      return Number.POSITIVE_INFINITY;
    }
    if (x < EXP_UNDERFLOW) {
      return 0;
    }
  }
  let k = 0;
  let hi = 0;
  let lo = 0;
  let v = x;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = Math.trunc(INV_LN2 * x + (negative ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    v = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = v * v;
  const c = v - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) {
    return 1 - ((v * c) / (c - 2) - v);
  }
  const y = 1 - (lo - (v * c) / (2 - c) - hi);
  if (k >= -1021) {
    return withHighWord(y, highWord(y) + (k << 20));
  }
  return withHighWord(y, highWord(y) + ((k + 1000) << 20)) * TWO_POW_MINUS_1000;
}
