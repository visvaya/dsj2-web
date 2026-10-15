import { describe, expect, it } from "vitest";
import { crc32, zipFile } from "./zip-file";

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
