import { describe, expect, it } from "vitest";
import {
  REPLAY_FILE_MAX_ENTRIES,
  fileNamePart,
  readReplayFile,
  replayArchiveName,
  replayFileName,
  replayFileText,
} from "./replay-file";
import { encodeInputs } from "./input-codec";
import { ENGINE_REVISION, type ShelfEntry } from "./replay-shelf";

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
    expect(replayArchiveName(new Date(2026, 9, 14, 8, 5, 9))).toBe("telemark-powtorki_2026-10-14_08-05-09.zip");
  });

  it("is named in sections: the game, the moment of the jump to the second and the hill", () => {
    const jumped = { ...entry("a"), dateIso: new Date(2026, 9, 14, 8, 5, 9).toISOString() };
    expect(replayFileName(jumped)).toBe("telemark-powtorka_2026-10-14_08-05-09_cwiczebna-k90.json");
    expect(fileNamePart("Zakopane 1 · Łódź!")).toBe("zakopane-1-lodz");
  });

  it("reads no more replays than the shelf holds, and counts the rest as unread", () => {
    const many = Array.from({ length: REPLAY_FILE_MAX_ENTRIES + 5 }, (_, i) => entry(`e${i}`));
    expect(readReplayFile(replayFileText(many, NOW))).toMatchObject({ unreadable: 5 });
  });

  it("reads a file of the first version as well", () => {
    const text = replayFileText([entry("a")], NOW).replace('"formatVersion":2', '"formatVersion":1');
    expect(readReplayFile(text)?.entries).toHaveLength(1);
    expect(readReplayFile(text.replace('"formatVersion":1', '"formatVersion":3'))).toBeNull();
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
    expect(readReplayFile(JSON.stringify({ format: "telemark-replays", formatVersion: 3, replays: [] }))).toBeNull();
    expect(readReplayFile(JSON.stringify({ format: "telemark-replays", formatVersion: 1, replays: {} }))).toBeNull();
    expect(readReplayFile(" ".repeat(6_000_001))).toBeNull();
  });
});
