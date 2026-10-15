import { describe, expect, it } from "vitest";
import { fileNamePart, readReplayFile, replayFileName, replayFileText } from "./replay-file";
import { ENGINE_REVISION, encodeInputs, type ShelfEntry } from "./replay-shelf";

const NOW = new Date("2026-10-14T12:00:00.000Z");

const entry = (id: string): ShelfEntry => ({
  id,
  kind: "record",
  hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 },
  dateIso: "2026-10-14T11:00:00.000Z",
  result: { distanceM: 88.5, points: 101.5, fell: false },
  newRecord: true,
  engineRevision: ENGINE_REVISION,
  replay: { kind: "own", seed: 42, inputs: encodeInputs([{ left: true, right: false, dy: -5 }]) },
});

describe("a file of replays", () => {
  it("reads back the replays it was written with", () => {
    const entries = [entry("a"), entry("b")];
    expect(readReplayFile(replayFileText(entries, NOW))).toEqual({ entries, unreadable: 0 });
    const at = new Date(2026, 9, 14, 8, 5, 9);
    expect(replayFileName([], at)).toBe("telemark-powtorki-2026-10-14_08-05-09.json");
  });

  it("is named after the moment of the export and the hill, when all the replays are of one", () => {
    const at = new Date(2026, 9, 14, 8, 5, 9);
    expect(replayFileName([entry("a"), entry("b")], at)).toBe(
      "telemark-powtorki-2026-10-14_08-05-09-cwiczebna-k90.json",
    );
    const other = { ...entry("c"), hill: { id: "original-36", name: "Wisła", kPointM: 105 } };
    expect(replayFileName([entry("a"), other], at)).toBe("telemark-powtorki-2026-10-14_08-05-09.json");
    expect(fileNamePart("Zakopane 1 · Łódź!")).toBe("zakopane-1-lodz");
  });

  it("counts the replays it cannot read and keeps the rest", () => {
    const text = JSON.stringify({
      format: "telemark-replays",
      formatVersion: 1,
      replays: [entry("a"), { id: 3 }, null],
    });
    expect(readReplayFile(text)).toEqual({ entries: [entry("a")], unreadable: 2 });
  });

  it("is not one when it is another file, another version or too large", () => {
    expect(readReplayFile("not json")).toBeNull();
    expect(readReplayFile(JSON.stringify({ format: "other", formatVersion: 1, replays: [] }))).toBeNull();
    expect(readReplayFile(JSON.stringify({ format: "telemark-replays", formatVersion: 2, replays: [] }))).toBeNull();
    expect(readReplayFile(JSON.stringify({ format: "telemark-replays", formatVersion: 1, replays: {} }))).toBeNull();
    expect(readReplayFile(" ".repeat(6_000_001))).toBeNull();
  });
});
