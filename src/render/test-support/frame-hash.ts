/** FNV-1a over every byte of a frame, so every pixel counts. */
export function fnv(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16);
}
