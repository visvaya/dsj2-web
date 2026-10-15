/**
 * A ZIP archive of a few files, stored without compression (method 0): enough to hand several small files to the
 * player as one download, and readable by every system's own unpacker. Names are plain ASCII.
 */

export interface ZipEntry {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
/** Version 2.0: the oldest that every unpacker reads. */
const ZIP_VERSION = 20;
/** 1980-01-01 00:00 in DOS form: no file carries a time of its own. */
const DOS_DATE_1980 = 0x21;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 as ZIP uses it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The bytes of the archive. */
export function zipFile(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({ ...entry, name: encoder.encode(entry.name), crc: crc32(entry.bytes) }));
  const localBytes = files.reduce((sum, f) => sum + LOCAL_HEADER_BYTES + f.name.length + f.bytes.length, 0);
  const centralBytes = files.reduce((sum, f) => sum + CENTRAL_HEADER_BYTES + f.name.length, 0);
  const out = new Uint8Array(localBytes + centralBytes + END_RECORD_BYTES);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const bytes = (data: Uint8Array) => {
    out.set(data, at);
    at += data.length;
  };
  /** Version needed, flags, method, time, date, CRC and both sizes: the same in both headers. */
  const common = (f: (typeof files)[number]) => {
    u16(ZIP_VERSION);
    u16(0);
    u16(0);
    u16(0);
    u16(DOS_DATE_1980);
    u32(f.crc);
    u32(f.bytes.length);
    u32(f.bytes.length);
    u16(f.name.length);
  };
  const offsets = files.map((f) => {
    const offset = at;
    u32(0x04034b50);
    common(f);
    u16(0);
    bytes(f.name);
    bytes(f.bytes);
    return offset;
  });
  const centralStart = at;
  files.forEach((f, i) => {
    u32(0x02014b50);
    u16(ZIP_VERSION);
    common(f);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i] ?? 0);
    bytes(f.name);
  });
  const centralSize = at - centralStart;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralSize);
  u32(centralStart);
  u16(0);
  return out;
}

/** Limits of an archive read from the player's disk: more than any archive of replays has, far less than a bomb. */
export const ZIP_READ_LIMITS = { MAX_FILES: 300, MAX_FILE_BYTES: 6_000_000, MAX_TOTAL_BYTES: 12_000_000 } as const;

const STORED = 0;
const DEFLATED = 8;

/** The bytes of a deflated file, cut off once it unpacks to more than `maxBytes`; null then or when it is damaged. */
async function inflated(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      // One part after another: the size is checked as the file unpacks.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        // The rest is not read: the reading stops here, once.
        // oxlint-disable-next-line no-await-in-loop
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * The files of a ZIP archive, stored or deflated, by its central directory; null when it is not one, uses what
 * this reader does not (ZIP64, encryption), or holds more than the limits. Folders are left out.
 */
export async function readZip(zip: Uint8Array<ArrayBuffer>): Promise<ZipEntry[] | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - END_RECORD_BYTES;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count > ZIP_READ_LIMITS.MAX_FILES) return null;
  const files: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_HEADER_BYTES > zip.length || view.getUint32(at, true) !== 0x02014b50) return null;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      zip.subarray(at + CENTRAL_HEADER_BYTES, at + CENTRAL_HEADER_BYTES + nameLength),
    );
    at += CENTRAL_HEADER_BYTES + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || (method !== STORED && method !== DEFLATED)) return null;
    if (size > ZIP_READ_LIMITS.MAX_FILE_BYTES || (total += size) > ZIP_READ_LIMITS.MAX_TOTAL_BYTES) return null;
    if (local + LOCAL_HEADER_BYTES > zip.length || view.getUint32(local, true) !== 0x04034b50) return null;
    const dataAt = local + LOCAL_HEADER_BYTES + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataAt + packed > zip.length) return null;
    const data = zip.slice(dataAt, dataAt + packed);
    // oxlint-disable-next-line no-await-in-loop
    const bytes = method === STORED ? data : await inflated(data, ZIP_READ_LIMITS.MAX_FILE_BYTES);
    if (bytes === null || bytes.length !== size) return null;
    if (!name.endsWith("/")) files.push({ name, bytes });
  }
  return files;
}

/** Whether bytes begin like a ZIP archive. */
export const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
