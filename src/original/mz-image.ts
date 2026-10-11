/** Load image of a DOS MZ executable (the bytes after the header, before relocation). */
export interface MzImage {
  image: Uint8Array;
}

const MZ_MAGIC = 0x5a4d;
const PARAGRAPH_BYTES = 16;
const PAGE_BYTES = 512;
const HEADER_MIN_BYTES = 0x1c;

export function readMzImage(file: Uint8Array): MzImage {
  if (file.length < HEADER_MIN_BYTES) {
    throw new Error("file too short for an MZ executable");
  }
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (v.getUint16(0, true) !== MZ_MAGIC) {
    throw new Error("not an MZ executable");
  }
  const lastPageBytes = v.getUint16(2, true);
  const pages = v.getUint16(4, true);
  const headerParagraphs = v.getUint16(8, true);
  const size = (pages - 1) * PAGE_BYTES + (lastPageBytes === 0 ? PAGE_BYTES : lastPageBytes);
  const start = headerParagraphs * PARAGRAPH_BYTES;
  if (pages === 0 || size > file.length || start > size) {
    throw new Error("MZ header does not match the file size");
  }
  return { image: file.subarray(start, size) };
}
