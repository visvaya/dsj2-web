import { describe, expect, it } from "vitest";
import { ENGINE_REVISION, type ShelfEntry } from "./replay-shelf";
import { EMPTY_JOURNAL, journalAfter, journalAfterWrite, mergedShelf } from "./shelf-merge";

function entry(id: string, over: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    id,
    kind: "kept",
    hill: { id: "own-1", name: "A", kPointM: 90 },
    dateIso: "2026-10-14T12:00:00.000Z",
    result: { distanceM: 88.5, points: 101.5, fell: false },
    newRecord: false,
    engineRevision: ENGINE_REVISION,
    replay: { kind: "own", seed: 42, inputs: "" },
    ...over,
  };
}

const record = (id: string, distanceM: number, dateIso = "2026-10-14T12:00:00.000Z") =>
  entry(id, { kind: "record", dateIso, result: { distanceM, points: 100, fell: false } });

const ids = (shelf: readonly ShelfEntry[]) => shelf.map((e) => e.id);

describe("merging the shelf of a window with the stored one", () => {
  it("keeps what another window stored and adds what this window added", () => {
    const journal = journalAfter(EMPTY_JOURNAL, [], [entry("mine")]);
    expect(ids(mergedShelf([entry("theirs")], [entry("mine")], journal))).toEqual(["mine", "theirs"]);
  });

  it("does not bring back what this window deleted", () => {
    const before = [entry("a"), entry("b")];
    const journal = journalAfter(EMPTY_JOURNAL, before, [entry("b")]);
    expect(ids(mergedShelf(before, [entry("b")], journal))).toEqual(["b"]);
  });

  it("drops what another window deleted once it had been stored", () => {
    // "a" came from the store, so its absence there now is a deletion elsewhere.
    expect(ids(mergedShelf([], [entry("a")], EMPTY_JOURNAL))).toEqual([]);
    // "b" was added here and stored; another window deleted it since.
    const added = journalAfter(EMPTY_JOURNAL, [], [entry("b")]);
    const written = journalAfterWrite(added, [entry("b")]);
    expect(ids(mergedShelf([], [entry("b")], written))).toEqual([]);
  });

  it("keeps an entry added again after this window deleted it", () => {
    const deleted = journalAfter(EMPTY_JOURNAL, [entry("a")], []);
    const again = journalAfter(deleted, [], [entry("a")]);
    expect(ids(mergedShelf([], [entry("a")], again))).toEqual(["a"]);
  });

  it("keeps one replay of a record per hill: the longer jump, then the newer", () => {
    const longer = record("longer", 214.5);
    const shorter = record("shorter", 210, "2026-10-15T12:00:00.000Z");
    const journal = journalAfter(EMPTY_JOURNAL, [], [shorter]);
    expect(ids(mergedShelf([longer], [shorter], journal))).toEqual(["longer"]);
    const later = record("later", 214.5, "2026-10-16T12:00:00.000Z");
    expect(ids(mergedShelf([longer], [later], journalAfter(EMPTY_JOURNAL, [], [later])))).toEqual(["later"]);
    const otherHill = { ...record("other", 100), hill: { id: "own-2", name: "B", kPointM: 50 } };
    expect(ids(mergedShelf([longer], [otherHill], journalAfter(EMPTY_JOURNAL, [], [otherHill])))).toEqual([
      "other",
      "longer",
    ]);
  });

  it("lets the better record stand when this window put a shorter one in place of one from another window", () => {
    // The other window's record arrived here first; this window, with an older save, took its shorter jump for a
    // record and put it in its place.
    const theirs = record("theirs", 214.5);
    const mine = record("mine", 190, "2026-10-15T12:00:00.000Z");
    const journal = journalAfter(EMPTY_JOURNAL, [theirs], [mine]);
    expect(ids(mergedShelf([theirs], [mine], journal))).toEqual(["theirs"]);
    // Deleted by hand, with no record of the hill left, it stays deleted.
    expect(ids(mergedShelf([theirs], [], journalAfter(EMPTY_JOURNAL, [theirs], [])))).toEqual([]);
  });
});
