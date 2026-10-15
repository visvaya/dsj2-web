import { describe, expect, it } from "vitest";
import type { FrameInput } from "../sim/jump-logic";
import {
  ENGINE_REVISION,
  REPLAY_LIMITS,
  cleanedShelf,
  decodeInputs,
  encodeInputs,
  entryBytes,
  oldestRemovable,
  parseShelf,
  readShelf,
  shelfBytes,
  shelfRecord,
  withKept,
  withLoaded,
  withRecent,
  withRecord,
  withoutEntries,
  type Shelf,
  type ShelfEntry,
} from "./replay-shelf";

const inputs: FrameInput[] = [
  { left: false, right: false, dy: 0 },
  { left: true, right: false, dy: -128 },
  { left: true, right: true, dy: 127 },
  { left: false, right: true, dy: -3 },
];

const entry = (id: string, over: Partial<ShelfEntry> = {}): ShelfEntry => ({
  id,
  kind: "kept",
  hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 },
  dateIso: "2026-10-14T12:00:00.000Z",
  result: { distanceM: 88.5, points: 101.5, fell: false },
  newRecord: false,
  engineRevision: ENGINE_REVISION,
  replay: { kind: "own", seed: 42, inputs: encodeInputs(inputs) },
  ...over,
});

const dated = (id: string, day: number, kind: ShelfEntry["kind"] = "kept"): ShelfEntry =>
  entry(id, { kind, dateIso: `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z` });

describe("inputs of a stored replay", () => {
  it("come back exactly as they went in, motion to the ends of its range", () => {
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
    expect(decodeInputs(encodeInputs([]))).toEqual([]);
  });

  it("are refused when the text is not what the encoder writes", () => {
    expect(decodeInputs("not base64 !")).toBeNull();
    expect(decodeInputs(btoa("abc"))).toBeNull();
    expect(decodeInputs(btoa(String.fromCharCode(9, 0)))).toBeNull();
  });
});

describe("the shelf of replays", () => {
  it("keeps one replay of a record per hill, the newest", () => {
    const first = withRecord([], entry("a", { kind: "record" }));
    const other = withRecord(first, entry("b", { hill: { id: "own-2", name: "B", kPointM: 50 } }));
    const again = withRecord(other, entry("c"));
    expect(again.map((e) => [e.id, e.kind])).toEqual([
      ["b", "record"],
      ["c", "record"],
    ]);
  });

  it("keeps the replay of a new record even beyond the size", () => {
    const big = entry("big", { kind: "kept", replay: { kind: "original", rpl: "A".repeat(1600) } });
    const full: Shelf = Array.from({ length: 4000 }, (_, i) => ({ ...big, id: `b${i}` }));
    expect(shelfBytes(full)).toBeGreaterThan(REPLAY_LIMITS.BUDGET_BYTES);
    expect(withRecord(full, entry("record")).at(-1)?.kind).toBe("record");
    expect(withKept(full, entry("more", { replay: { kind: "own", seed: 7, inputs: "" } })).refused).toBe("keptFull");
  });

  it("does not keep the same jump twice, whatever it was kept from", () => {
    const shelf = withKept([], entry("first")).shelf;
    expect(withKept(shelf, entry("again", { kind: "recent" })).refused).toBe("alreadyKept");
    expect(
      withKept(shelf, entry("other", { replay: { kind: "own", seed: 43, inputs: encodeInputs(inputs) } })).refused,
    ).toBeNull();
  });

  it("refuses a replay kept by hand once the kept ones are full, and drops nothing", () => {
    const distinct = (id: string, seed: number) =>
      entry(id, { replay: { kind: "own", seed, inputs: encodeInputs(inputs) } });
    const full: Shelf = Array.from({ length: REPLAY_LIMITS.KEPT_MAX_COUNT }, (_, i) => distinct(`k${i}`, 1000 + i));
    const outcome = withKept(full, distinct("new", 1));
    expect(outcome.refused).toBe("keptFull");
    expect(outcome.shelf).toBe(full);
    // Records do not count towards that limit.
    const withRecords = [...full.slice(1), entry("r", { kind: "record" })];
    expect(withKept(withRecords, distinct("new", 1)).refused).toBeNull();
  });

  it("reads a file's replay into its own group, once, up to its own limit", () => {
    const kept: Shelf = [entry("a")];
    expect(withLoaded(kept, entry("b")).refused).toBe("alreadyKept");
    const other = entry("b", { replay: { kind: "own", seed: 43, inputs: encodeInputs(inputs) } });
    const read = withLoaded(kept, other);
    expect(read.shelf.map((e) => e.kind)).toEqual(["kept", "loaded"]);
    expect(withLoaded(read.shelf, other).refused).toBe("alreadyKept");
    const full = Array.from({ length: REPLAY_LIMITS.LOADED_MAX_COUNT }, (_, i) =>
      entry(`l${i}`, { kind: "loaded", replay: { kind: "own", seed: 1000 + i, inputs: "" } }),
    );
    expect(withLoaded(full, other)).toEqual({ shelf: full, refused: "loadedFull" });
  });

  it("keeps only the newest of the last jumps, as many as the player chose", () => {
    let shelf: Shelf = [entry("kept")];
    for (const id of ["1", "2", "3", "4"]) shelf = withRecent(shelf, entry(id, { kind: "recent" }), 2).shelf;
    expect(shelf.map((e) => e.id)).toEqual(["kept", "3", "4"]);
    expect(withRecent(shelf, entry("5"), 0).shelf.map((e) => e.id)).toEqual(["kept"]);
  });

  it("frees room by the oldest replays that are not records", () => {
    const shelf = [dated("r", 1, "record"), dated("old", 2), dated("mid", 5, "recent"), dated("new", 9)];
    expect([...oldestRemovable(shelf, 2)]).toEqual(["old", "mid"]);
    expect(withoutEntries(shelf, oldestRemovable(shelf, 2)).map((e) => e.id)).toEqual(["r", "new"]);
  });
});

describe("the clean-up the player asks for", () => {
  const shelf = [dated("record", 1, "record"), dated("old", 2), dated("recent", 10, "recent"), dated("new", 13)];
  const now = new Date("2026-10-14T12:00:00.000Z");

  it("does nothing while both rules are off", () => {
    expect(cleanedShelf(shelf, { maxAgeDays: null, maxBytes: null }, now)).toEqual(shelf);
  });

  it("drops replays older than the age, never a record", () => {
    expect(cleanedShelf(shelf, { maxAgeDays: 7, maxBytes: null }, now).map((e) => e.id)).toEqual([
      "record",
      "recent",
      "new",
    ]);
  });

  it("drops the oldest until the shelf is within the size, never a record", () => {
    const size = shelfBytes(shelf);
    const one = entryBytes(shelf[1] ?? entry("x"));
    const cleaned = cleanedShelf(shelf, { maxAgeDays: null, maxBytes: size - one }, now);
    expect(cleaned.map((e) => e.id)).toEqual(["record", "recent", "new"]);
    expect(shelfBytes(cleaned)).toBeLessThanOrEqual(size - one);
    expect(cleanedShelf(shelf, { maxAgeDays: null, maxBytes: 1 }, now).map((e) => e.id)).toEqual(["record"]);
  });
});

describe("the stored shelf", () => {
  it("is read back as it was stored", () => {
    const shelf = [
      entry("a"),
      entry("b", { kind: "record", replay: { kind: "original", rpl: "AAAA", jumperName: "X" } }),
      entry("c", {
        kind: "loaded",
        replay: { kind: "own", seed: 7, inputs: "", scenery: { lighting: "night", snowfall: true, fog: false } },
      }),
    ];
    expect(parseShelf(JSON.parse(JSON.stringify(shelfRecord(shelf))))).toEqual(shelf);
  });

  it("reads a look that is not one as none, and the read ones of before as read ones", () => {
    const odd = entry("a", { replay: { kind: "own", seed: 7, inputs: "" } });
    const stored = [
      { ...odd, replay: { ...odd.replay, scenery: { lighting: "noon", snowfall: true, fog: false } } },
      entry("import:2026-10-14T12:00:00.000Z:0"),
      entry("original:original-35:2026-10-14T12:00:00.000Z"),
      entry("kept:import:2026-10-14T12:00:00.000Z:0"),
    ];
    const read = parseShelf(JSON.parse(JSON.stringify({ ...shelfRecord([]), entries: stored })));
    expect(read[0]?.replay).toEqual({ kind: "own", seed: 7, inputs: "" });
    expect(read.map((e) => e.kind)).toEqual(["kept", "loaded", "loaded", "kept"]);
  });

  it("leaves out damaged entries and reads an unknown version as empty", () => {
    const damaged = { ...entry("bad"), result: { distanceM: "far" } };
    const record = {
      schemaVersion: 1,
      entries: [entry("ok"), damaged, null, { ...entry("x"), replay: { kind: "own", seed: 1, inputs: "!!" } }],
    };
    expect(parseShelf(record).map((e) => e.id)).toEqual(["ok"]);
    expect(parseShelf({ schemaVersion: 99, entries: [entry("ok")] })).toEqual([]);
    expect(parseShelf(null)).toEqual([]);
  });

  it("tells a foreign record from an empty one and keeps apart what it cannot read", () => {
    expect(readShelf(undefined)).toEqual({ shelf: [], unreadable: [], foreign: false });
    expect(readShelf({ schemaVersion: 99, entries: [] }).foreign).toBe(true);
    const doubledId = entry("a");
    const secondRecord = entry("r2", { kind: "record" });
    const badDate = entry("d", { dateIso: "yesterday" });
    const read = readShelf({
      schemaVersion: 1,
      entries: [entry("a"), doubledId, entry("r1", { kind: "record" }), secondRecord, badDate],
    });
    expect(read.shelf.map((e) => e.id)).toEqual(["a", "r1"]);
    expect(read.unreadable).toEqual([doubledId, secondRecord, badDate]);
    expect(read.foreign).toBe(false);
  });
});
