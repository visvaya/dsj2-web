import { describe, expect, it } from "vitest";
import { decodePushedCalls, readHillTable } from "./hill-table";

/** Builds x86 code in the shape of the original hill setup routine (made-up values). */
class CodeBuilder {
  bytes: number[] = [];

  get at(): number {
    return this.bytes.length;
  }

  word(w: number): this {
    // Use the short form where the original assembler would.
    const signed = w >= 0x8000 ? w - 0x10000 : w;
    if (signed >= -128 && signed <= 127) {
      this.bytes.push(0x6a, signed & 0xff);
    } else {
      this.bytes.push(0x68, w & 0xff, w >> 8);
    }
    return this;
  }

  single(x: number): this {
    const v = new DataView(new ArrayBuffer(4));
    v.setFloat32(0, x, true);
    return this.word(v.getUint16(2, true)).word(v.getUint16(0, true));
  }

  callFar(seg: number, off: number): this {
    this.bytes.push(0x9a, off & 0xff, off >> 8, seg & 0xff, seg >> 8);
    return this;
  }

  callNear(target: number): this {
    const rel = (target - (this.at + 3)) & 0xffff;
    this.bytes.push(0xe8, rel & 0xff, rel >> 8);
    return this;
  }

  /** cmp al, n ; je +3 ; jmp rel16 (patched later). Returns the position of rel16. */
  branch(n: number): number {
    this.bytes.push(0x3c, n, 0x74, 0x03, 0xe9, 0, 0);
    return this.at - 2;
  }

  patchJump(relAt: number, target: number): void {
    const rel = (target - (relAt + 2)) & 0xffff;
    this.bytes[relAt] = rel & 0xff;
    this.bytes[relAt + 1] = rel >> 8;
  }
}

interface FakeHill {
  k: number;
  takeoff: number;
}

function emitHill(c: CodeBuilder, h: FakeHill): void {
  c.single(3.5).single(9).single(23).single(h.takeoff).single(10).word(0xffa3);
  c.single(-1.1).single(221).single(0.017).word(12).word(30).word(0xffc0);
  c.callFar(0x1eee, 0x051f);
  c.single(132).single(130).single(48).single(52).single(220).single(0.003);
  c.word(95).word(2).word(h.k).word(0).word(0x60).single(0).single(0.6);
  c.callFar(0x1eee, 0x06e1);
  c.word(0x17).word(0x39).callFar(0x003f, 0x9da5);
  c.callNear(0);
}

function buildImage(hills: FakeHill[], decoy = true): Uint8Array {
  const c = new CodeBuilder();
  if (decoy) {
    // A lone "cmp al, 1" elsewhere must not be taken for the table.
    c.branch(1);
    c.bytes.push(0x90, 0x90);
  }
  const pending: number[] = [];
  hills.forEach((h, i) => {
    const prev = pending.pop();
    if (prev !== undefined) c.patchJump(prev, c.at);
    const rel = c.branch(i + 1);
    emitHill(c, h);
    if (i < hills.length - 1) {
      c.bytes.push(0xe9, 0, 0); // jmp to the join point
    }
    pending.push(rel);
  });
  const last = pending.pop();
  if (last !== undefined) c.patchJump(last, c.at);
  c.bytes.push(0xbf, 0x8a, 0x49); // mov di, imm16 at the join point
  return Uint8Array.from(c.bytes);
}

describe("hill table in the executable", () => {
  it("reads every branch with its K point and parameters", () => {
    const img = buildImage([
      { k: 105, takeoff: 52.3 },
      { k: 170, takeoff: 76.8 },
      { k: 85, takeoff: 44 },
    ]);
    const hills = readHillTable(img);
    expect(hills.map((h) => [h.number, h.kPointM])).toEqual([
      [1, 105],
      [2, 170],
      [3, 85],
    ]);
    const [first] = hills;
    expect(first?.inrun).toEqual({
      flatEndXM: 9,
      lineEndXM: 23,
      takeoffXM: Math.fround(52.3),
      startXM: 10,
      lineSlope: Math.fround(-1.1),
      lineInterceptM: 221,
      curveA: Math.fround(0.017),
    });
    expect(first?.landing).toEqual({
      centerXM: 132,
      centerYM: 130,
      amplitudeM: 48,
      widthM: 52,
      outrunStartXM: 220,
      outrunCurveA: Math.fround(0.003),
      knollBlend: Math.fround(0.6),
    });
    expect(first?.calls.map((call) => call.kind)).toEqual(["far", "far", "far", "near"]);
    expect(first?.calls[2]?.words).toEqual([0x17, 0x39]);
  });

  it("decodes short pushes as sign-extended words", () => {
    const calls = decodePushedCalls(
      Uint8Array.from([0x6a, 0xa3, 0x6a, 0x05, 0x68, 0x34, 0x12, 0x9a, 1, 0, 2, 0, 0xc3]),
      0,
    );
    expect(calls).toEqual([{ kind: "far", target: 0x0002_0001, words: [0xffa3, 0x0005, 0x1234] }]);
  });

  it("rejects an image without the table", () => {
    expect(() => readHillTable(new Uint8Array(64))).toThrow("hill table not found");
  });

  it("rejects implausible values", () => {
    expect(() => readHillTable(buildImage([{ k: 0, takeoff: 52.3 }], false))).toThrow("hill 1");
  });
});
