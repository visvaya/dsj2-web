/**
 * Resource file of the original game (Dsj.dat), read by 1bc6:0039:
 *
 *   u32 offset[DIRECTORY_ENTRIES]   (0 = no resource)
 *   at offset: u16 length, then `length` bytes
 *
 * Text resources hold a table of u16 offsets; each offset points one byte
 * past a length byte, followed by the text in code page 852.
 */

const DIRECTORY_ENTRY_BYTES = 4;
/** Polish user-interface texts of v2.10P. */
export const TEXT_RESOURCE_ID = 220;
/** Text index of the name of hill 1; hill n uses HILL_NAME_TEXT_BASE + n. */
export const HILL_NAME_TEXT_BASE = 198;

/** Bytes taken by the directory: it ends where the first resource starts. */
function directoryBytes(v: DataView): number {
  let end = v.byteLength;
  for (let at = 0; at + DIRECTORY_ENTRY_BYTES <= end; at += DIRECTORY_ENTRY_BYTES) {
    const offset = v.getUint32(at, true);
    if (offset !== 0 && offset < end) end = offset;
  }
  if (end % DIRECTORY_ENTRY_BYTES !== 0) {
    throw new Error("not a resource file");
  }
  return end;
}

export function readResource(dat: Uint8Array, id: number): Uint8Array | null {
  const v = new DataView(dat.buffer, dat.byteOffset, dat.byteLength);
  if (dat.length < DIRECTORY_ENTRY_BYTES) {
    throw new Error("resource file too short");
  }
  if (id < 0 || (id + 1) * DIRECTORY_ENTRY_BYTES > directoryBytes(v)) {
    return null;
  }
  const offset = v.getUint32(id * DIRECTORY_ENTRY_BYTES, true);
  if (offset === 0) {
    return null;
  }
  if (offset + 2 > dat.length) {
    throw new Error(`resource ${id}: offset past the end of the file`);
  }
  const length = v.getUint16(offset, true);
  if (offset + 2 + length > dat.length) {
    throw new Error(`resource ${id}: length past the end of the file`);
  }
  return dat.subarray(offset + 2, offset + 2 + length);
}

// Code page 852 (Central European DOS), bytes 0x80..0xFF.
const CP852_HIGH = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x016f, 0x0107, 0x00e7, 0x0142, 0x00eb, 0x0150, 0x0151, 0x00ee, 0x0179,
  0x00c4, 0x0106, 0x00c9, 0x0139, 0x013a, 0x00f4, 0x00f6, 0x013d, 0x013e, 0x015a, 0x015b, 0x00d6, 0x00dc, 0x0164,
  0x0165, 0x0141, 0x00d7, 0x010d, 0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x0104, 0x0105, 0x017d, 0x017e, 0x0118, 0x0119,
  0x00ac, 0x017a, 0x010c, 0x015f, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00c1, 0x00c2, 0x011a,
  0x015e, 0x2563, 0x2551, 0x2557, 0x255d, 0x017b, 0x017c, 0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c,
  0x0102, 0x0103, 0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x00a4, 0x0111, 0x0110, 0x010e, 0x00cb,
  0x010f, 0x0147, 0x00cd, 0x00ce, 0x011b, 0x2518, 0x250c, 0x2588, 0x2584, 0x0162, 0x016e, 0x2580, 0x00d3, 0x00df,
  0x00d4, 0x0143, 0x0144, 0x0148, 0x0160, 0x0161, 0x0154, 0x00da, 0x0155, 0x0170, 0x00fd, 0x00dd, 0x0163, 0x00b4,
  0x00ad, 0x02dd, 0x02db, 0x02c7, 0x02d8, 0x00a7, 0x00f7, 0x00b8, 0x00b0, 0x00a8, 0x02d9, 0x0171, 0x0158, 0x0159,
  0x25a0, 0x00a0,
];

export function decodeCp852(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) {
    text += String.fromCharCode(b < 0x80 ? b : (CP852_HIGH[b - 0x80] ?? 0xfffd));
  }
  return text;
}

/** Text with the given index, or null when the entry does not point inside the resource. */
export function readText(resource: Uint8Array, index: number): string | null {
  const v = new DataView(resource.buffer, resource.byteOffset, resource.byteLength);
  if (resource.length < 2) {
    return null;
  }
  // The first text starts right after the table and its length byte.
  const tableBytes = v.getUint16(0, true) - 1;
  if (index < 0 || 2 * index + 2 > tableBytes || 2 * index + 2 > resource.length) {
    return null;
  }
  const at = v.getUint16(2 * index, true);
  if (at < 1 || at > resource.length) {
    return null;
  }
  const length = resource[at - 1] ?? 0;
  if (at + length > resource.length) {
    return null;
  }
  return decodeCp852(resource.subarray(at, at + length));
}
