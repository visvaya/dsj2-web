/**
 * Integer conversions with the semantics of Borland Pascal 7 on the x87.
 */

/** Round(x): FISTP with the default rounding mode, nearest with ties to even. */
export function roundHalfEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Trunc(x): conversion towards zero. */
export function truncToInt(v: number): number {
  return Math.trunc(v);
}

/** Wraps to a signed 16-bit Integer, as stores to Pascal `Integer` variables do. */
export function toInt16(v: number): number {
  return ((v & 0xffff) << 16) >> 16;
}

/** Wraps to an unsigned 16-bit Word, as pushes of `Word` arguments do. */
export function toWord(v: number): number {
  return v & 0xffff;
}
