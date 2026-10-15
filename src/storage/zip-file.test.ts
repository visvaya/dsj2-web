import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { ZIP_READ_LIMITS, crc32, looksLikeZip, readZip, zipFile } from "./zip-file";

const ascii = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

describe("a ZIP archive", () => {
  it("checks its files with the CRC-32 of ZIP", () => {
    expect(crc32(ascii("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("holds each file as it is, listed at its offset by the central directory", () => {
    const entries = [
      { name: "15070509.rpl", bytes: ascii("first file") },
      { name: "15070612.rpl", bytes: new Uint8Array([0, 255, 7]) },
    ];
    const zip = zipFile(entries);
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let central = view.getUint32(end + 16, true);
    expect(view.getUint32(end + 12, true)).toBe(end - central);
    for (const entry of entries) {
      expect(view.getUint32(central, true)).toBe(0x02014b50);
      const nameLength = view.getUint16(central + 28, true);
      const name = new TextDecoder().decode(zip.subarray(central + 46, central + 46 + nameLength));
      const local = view.getUint32(central + 42, true);
      expect(name).toBe(entry.name);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      expect(view.getUint32(local + 14, true)).toBe(crc32(entry.bytes));
      const dataAt = local + 30 + view.getUint16(local + 26, true);
      expect([...zip.subarray(dataAt, dataAt + entry.bytes.length)]).toEqual([...entry.bytes]);
      central += 46 + nameLength;
    }
  });
});

/** One deflated file in an archive, as a zip program writes it (method 8). */
function deflatedZip(
  name: string,
  data: Uint8Array,
  options: { flags?: number; size?: number } = {},
): Uint8Array<ArrayBuffer> {
  const packed = new Uint8Array(deflateRawSync(data));
  const nameBytes = ascii(name);
  const out = new Uint8Array(30 + nameBytes.length + packed.length + 46 + nameBytes.length + 22);
  const view = new DataView(out.buffer);
  const header = (at: number, central: boolean) => {
    let p = at;
    const u16 = (v: number) => {
      view.setUint16(p, v, true);
      p += 2;
    };
    const u32 = (v: number) => {
      view.setUint32(p, v, true);
      p += 4;
    };
    u32(central ? 0x02014b50 : 0x04034b50);
    if (central) u16(20);
    u16(20);
    u16(options.flags ?? 0);
    u16(8);
    u16(0);
    u16(0x21);
    u32(crc32(data));
    u32(packed.length);
    u32(options.size ?? data.length);
    u16(nameBytes.length);
    u16(0);
    if (central) {
      u16(0);
      u16(0);
      u16(0);
      u32(0);
      u32(0);
    }
    out.set(nameBytes, p);
    return p + nameBytes.length;
  };
  const dataAt = header(0, false);
  out.set(packed, dataAt);
  const centralAt = dataAt + packed.length;
  const endAt = header(centralAt, true);
  view.setUint32(endAt, 0x06054b50, true);
  view.setUint16(endAt + 8, 1, true);
  view.setUint16(endAt + 10, 1, true);
  view.setUint32(endAt + 12, endAt - centralAt, true);
  view.setUint32(endAt + 16, centralAt, true);
  return out;
}

describe("an archive read from the player's disk", () => {
  it("gives back the files this game writes", async () => {
    const entries = [
      { name: "a.json", bytes: ascii("{}") },
      { name: "15070509.rpl", bytes: new Uint8Array(1222).fill(7) },
    ];
    const zip = zipFile(entries);
    expect(looksLikeZip(zip)).toBe(true);
    expect(await readZip(zip)).toEqual(entries);
  });

  it("unpacks a deflated file, as another program writes it", async () => {
    const text = ascii("powtorka ".repeat(500));
    expect(await readZip(deflatedZip("telemark-powtorka.json", text))).toEqual([
      { name: "telemark-powtorka.json", bytes: text },
    ]);
  });

  it("refuses what is not an archive, an encrypted file and a file larger than the limit", async () => {
    expect(looksLikeZip(ascii("{}"))).toBe(false);
    expect(await readZip(ascii("not an archive at all, just text"))).toBeNull();
    expect(await readZip(deflatedZip("x.json", ascii("x"), { flags: 1 }))).toBeNull();
    const big = new Uint8Array(ZIP_READ_LIMITS.MAX_FILE_BYTES + 1);
    expect(await readZip(deflatedZip("big.json", big))).toBeNull();
    // A size that lies about what the file unpacks to.
    expect(await readZip(deflatedZip("x.json", ascii("abcdef"), { size: 3 }))).toBeNull();
  });
});
