import { describe, expect, it } from "vitest";
import { decodeCp852, readResource, readText } from "./dsj-dat";

function textResource(texts: Uint8Array[]): Uint8Array {
  // Table of u16 offsets, then length-prefixed texts; each offset points past the length byte.
  const tableBytes = texts.length * 2;
  const out: number[] = Array.from({ length: tableBytes }, () => 0);
  let at = tableBytes;
  texts.forEach((t, i) => {
    out.push(t.length, ...t);
    out[2 * i] = (at + 1) & 0xff;
    out[2 * i + 1] = (at + 1) >> 8;
    at += 1 + t.length;
  });
  return Uint8Array.from(out);
}

function resourceFile(entries: Map<number, Uint8Array>, directoryEntries = 8): Uint8Array {
  const out: number[] = Array.from({ length: directoryEntries * 4 }, () => 0);
  for (const [id, data] of entries) {
    const offset = out.length;
    out.splice(id * 4, 4, offset & 0xff, (offset >> 8) & 0xff, (offset >> 16) & 0xff, offset >>> 24);
    out.push(data.length & 0xff, data.length >> 8, ...data);
  }
  return Uint8Array.from(out);
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("resource file", () => {
  it("returns resources by id and null for missing ones", () => {
    const dat = resourceFile(new Map([[2, Uint8Array.from([1, 2, 3])]]));
    expect(readResource(dat, 2)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(readResource(dat, 1)).toBeNull();
    expect(readResource(dat, 99)).toBeNull();
  });

  it("rejects a truncated file", () => {
    const dat = resourceFile(new Map([[0, Uint8Array.from([1, 2, 3])]]));
    expect(() => readResource(dat.subarray(0, dat.length - 1), 0)).toThrow("past the end");
  });

  it("reads texts from the offset table", () => {
    const res = textResource([ascii("Gotowe"), Uint8Array.from([0x57, 0x69, 0x73, 0x88, 0x61])]);
    expect(readText(res, 0)).toBe("Gotowe");
    expect(readText(res, 1)).toBe("Wisła");
    expect(readText(res, 5)).toBeNull();
  });

  it("decodes Polish letters of code page 852", () => {
    expect(decodeCp852(Uint8Array.from([0xa5, 0x86, 0xa9, 0x88, 0xe4, 0xa2, 0x98, 0xab, 0xbe]))).toBe("ąćęłńóśźż");
    expect(decodeCp852(Uint8Array.from([0xa4, 0x8f, 0xa8, 0x9d, 0xe3, 0xe0, 0x97, 0x8d, 0xbd]))).toBe("ĄĆĘŁŃÓŚŹŻ");
  });
});
