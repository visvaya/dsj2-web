import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTrace } from "./dsj-trace";
import { goldenTraces, hillGoldenFiles } from "./golden-files";

const SNAPSHOT_BYTES = 16;

/** A trace in the layout of tools/re/trace_capture.py with made-up snapshots. */
function syntheticTrace(records: { frame: number; point: number; fill: number }[]): Uint8Array {
  const out = new Uint8Array(20 + records.length * (5 + SNAPSHOT_BYTES));
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("DSJTRACE"), 0);
  view.setUint32(8, 1, true);
  view.setUint32(12, SNAPSHOT_BYTES, true);
  view.setUint32(16, records.length, true);
  records.forEach((record, i) => {
    const pos = 20 + i * (5 + SNAPSHOT_BYTES);
    view.setUint32(pos, record.frame, true);
    view.setUint8(pos + 4, record.point);
    out.fill(record.fill, pos + 5, pos + 5 + SNAPSHOT_BYTES);
  });
  return out;
}

const RECORDS = [
  { frame: 7, point: 0, fill: 0x11 },
  { frame: 7, point: 3, fill: 0x22 },
  { frame: 8, point: 1, fill: 0x33 },
];

const summary = (path: string) => readTrace(path).map((s) => [s.frame, s.point, s.view.byteLength, s.view.getUint8(5)]);
const expected = RECORDS.map((r) => [r.frame, r.point, SNAPSHOT_BYTES, r.fill]);

describe("trace files, plain and gzip-compressed", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dsj-trace-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a plain trace", () => {
    const path = join(dir, "A.trace");
    writeFileSync(path, syntheticTrace(RECORDS));
    expect(summary(path)).toEqual(expected);
  });

  it("reads a gzip-compressed trace with the same result", () => {
    const path = join(dir, "A.trace.gz");
    writeFileSync(path, gzipSync(syntheticTrace(RECORDS)));
    expect(summary(path)).toEqual(expected);
  });

  it("rejects a file that is not a trace, in either form", () => {
    const plain = join(dir, "bad.trace");
    const packed = join(dir, "bad2.trace.gz");
    writeFileSync(plain, new Uint8Array(40));
    writeFileSync(packed, gzipSync(new Uint8Array(40)));
    expect(() => readTrace(plain)).toThrow(/not a DSJ trace/);
    expect(() => readTrace(packed)).toThrow(/not a DSJ trace/);
  });

  it("rejects a trace cut short", () => {
    const path = join(dir, "short.trace");
    writeFileSync(path, syntheticTrace(RECORDS).subarray(0, 50));
    expect(() => readTrace(path)).toThrow(/truncated/);
  });

  it("lists both forms by the name of the replay, sorted, and ignores other files", () => {
    for (const file of ["Wisla.trace.gz", "Karpacz.trace", "hills.hilltrace", "manifest.json", "notes.gz"]) {
      writeFileSync(join(dir, file), "");
    }
    expect(goldenTraces({ DSJ2_TRACE_DIR: dir })).toEqual({
      requested: true,
      traces: [
        { name: "Karpacz", path: join(dir, "Karpacz.trace") },
        { name: "Wisla", path: join(dir, "Wisla.trace.gz") },
      ],
      problems: [],
    });
  });

  it("reports a trace present in both forms", () => {
    writeFileSync(join(dir, "Karpacz.trace"), "");
    writeFileSync(join(dir, "Karpacz.trace.gz"), "");
    expect(goldenTraces({ DSJ2_TRACE_DIR: dir }).problems).toEqual([expect.stringMatching(/Karpacz.*both/)]);
  });

  it("names a single compressed trace after its replay", () => {
    const path = join(dir, "Wisla.trace.gz");
    writeFileSync(path, "");
    expect(goldenTraces({ DSJ2_TRACE: path }).traces).toEqual([{ name: "Wisla", path }]);
  });

  it("finds the hill snapshots in either form and reports both", () => {
    const hillTrace = () => hillGoldenFiles({ DSJ2_TRACE_DIR: dir }).hillTrace;
    expect(hillTrace()).toBeUndefined();
    writeFileSync(join(dir, "hills.hilltrace.gz"), "");
    expect(hillTrace()).toBe(join(dir, "hills.hilltrace.gz"));
    writeFileSync(join(dir, "hills.hilltrace"), "");
    expect(hillTrace()).toBeUndefined();
    expect(hillGoldenFiles({ DSJ2_TRACE_DIR: dir }).problems).toContainEqual(expect.stringMatching(/both/));
    rmSync(join(dir, "hills.hilltrace.gz"));
    expect(hillTrace()).toBe(join(dir, "hills.hilltrace"));
  });
});
