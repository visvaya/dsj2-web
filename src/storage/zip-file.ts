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
