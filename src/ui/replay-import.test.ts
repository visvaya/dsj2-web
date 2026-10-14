import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { ENGINE_REVISION, REPLAY_LIMITS, encodeInputs, type Shelf, type ShelfEntry } from "../storage/replay-shelf";
import { recordingSource } from "./jump-replay";
import { base64Of, importedShelf, originalEntry } from "./replay-import";

const NOW = new Date("2026-10-14T12:00:00.000Z");

const entry = (seed: number, kind: ShelfEntry["kind"] = "record"): ShelfEntry => ({
  id: `e${seed}`,
  kind,
  hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 },
  dateIso: "2026-10-14T11:00:00.000Z",
  result: { distanceM: 88.5, points: 101.5, fell: false },
  newRecord: true,
  engineRevision: ENGINE_REVISION,
  replay: { kind: "own", seed, inputs: encodeInputs([{ left: true, right: false, dy: -5 }]) },
});

describe("replays from a file", () => {
  it("are kept, each once, beside what was there", () => {
    const shelf: Shelf = [entry(1, "kept")];
    const outcome = importedShelf(shelf, [entry(1), entry(2), entry(2), entry(3)], NOW);
    expect(outcome.added).toBe(2);
    expect(outcome.alreadyKept).toBe(2);
    expect(outcome.refused).toBeNull();
    expect(outcome.shelf.map((e) => [e.kind, e.replay.kind === "own" ? e.replay.seed : 0])).toEqual([
      ["kept", 1],
      ["kept", 2],
      ["kept", 3],
    ]);
    // New ids: an imported record does not take a hill's record over.
    expect(new Set(outcome.shelf.map((e) => e.id)).size).toBe(3);
  });

  it("stop at the limit of the kept ones and say so", () => {
    const many = Array.from({ length: REPLAY_LIMITS.KEPT_MAX_COUNT + 5 }, (_, i) => entry(100 + i));
    const outcome = importedShelf([], many, NOW);
    expect(outcome.added).toBe(REPLAY_LIMITS.KEPT_MAX_COUNT);
    expect(outcome.refused).toBe("keptFull");
  });
});

describe("a replay file of the original kept on the shelf", () => {
  it("keeps the file's bytes and the result it plays to", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    // No hands: a disqualified jump, which ends soon; the source stands in for a file of the original.
    const source = {
      ...recordingSource({ seed: 5, inputs: [], newRecord: false }),
      origin: "original" as const,
      jumperName: "X",
    };
    const file = new Uint8Array([1, 2, 250]);
    const kept = originalEntry(hill, file, source, NOW);
    expect(kept?.replay).toEqual({ kind: "original", rpl: base64Of(file), jumperName: "X" });
    expect(kept?.result.distanceM).toBe(0);
    expect(atob(base64Of(file))).toBe(String.fromCharCode(1, 2, 250));
  });
});
