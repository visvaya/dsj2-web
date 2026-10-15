import { describe, expect, it } from "vitest";
import { OWN_HILLS, originalHillId, type HillChoice } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { readZip, zipFile } from "../storage/zip-file";
import { UI_TEXT } from "../text/ui-text";
import { jumpResult, stepJump } from "./jump-round";
import { exportedReplaysFile, readChosenFile } from "./replay-files";
import { rplExport } from "./rpl-export";
import { ownEntry } from "./shelf-replays";

const NOW = new Date(2026, 9, 15, 9, 0, 0);

/** The original's hill 1, played on the built-in profile: the test needs no file of the original. */
const hillOne = (): HillChoice => {
  const own = OWN_HILLS[0];
  if (!own) throw new Error("no hill");
  return { ...own, id: originalHillId(1), source: "original" };
};

const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: 0,
});

/** A training jump kept on the shelf, jumped at the given minute. */
function kept(minute: number) {
  const hill = hillOne();
  let jump: TrainingJump = startTrainingJump(hill, 100 + minute);
  const inputs: FrameInput[] = [];
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    const step = stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, (l) => handsAt(l.frame));
    jump = step.jump;
    inputs.push(...step.taken);
  }
  const recording = { seed: 100 + minute, inputs, newRecord: false };
  return ownEntry("kept", hill, { recording, result: jumpResult(jump) }, new Date(2026, 9, 15, 8, minute, 0));
}

const bytesOf = async (file: File): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await file.arrayBuffer());

describe("replays handed over as files", () => {
  it("are one file for one replay, named after its jump", async () => {
    const file = exportedReplaysFile([kept(1)], NOW);
    expect(file.name).toBe("telemark-powtorka_2026-10-15_08-01-00_cwiczebna-k90.json");
    const read = await readChosenFile(await bytesOf(file), [], NOW);
    expect(read).toMatchObject({ kind: "replays", unreadable: 0, skipped: 0 });
    expect(read.kind === "replays" ? read.entries : []).toHaveLength(1);
  });

  it("are an archive with a file for each replay for several, read back whole", async () => {
    const file = exportedReplaysFile([kept(1), kept(2), kept(2)], NOW);
    expect(file.name).toBe("telemark-powtorki_2026-10-15_09-00-00.zip");
    const names = ((await readZip(await bytesOf(file))) ?? []).map((f) => f.name);
    expect(names).toEqual([
      "telemark-powtorka_2026-10-15_08-01-00_cwiczebna-k90.json",
      "telemark-powtorka_2026-10-15_08-02-00_cwiczebna-k90.json",
      "telemark-powtorka_2026-10-15_08-02-00_cwiczebna-k90-2.json",
    ]);
    const read = await readChosenFile(await bytesOf(file), [], NOW);
    expect(read.kind === "replays" ? read.entries : []).toHaveLength(3);
  });
});

describe("an archive chosen to read", () => {
  it("gives its replays and files of the original, and counts what is neither", async () => {
    const hill = hillOne();
    const made = rplExport(kept(3), [hill]);
    if (!made.ok) throw new Error(made.message);
    const json = await bytesOf(exportedReplaysFile([kept(4)], NOW));
    const zip = zipFile([
      { name: "a.json", bytes: json },
      { name: "15080300.rpl", bytes: made.file },
      { name: "notes.txt", bytes: new TextEncoder().encode("hello") },
    ]);
    const read = await readChosenFile(zip, [hill], NOW);
    expect(read).toMatchObject({ kind: "replays", unreadable: 0, skipped: 1 });
    expect(read.kind === "replays" ? read.entries.map((e) => e.replay.kind) : []).toEqual(["own", "original"]);
  });

  it("is refused when it cannot be read", async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(await readChosenFile(broken, [], NOW)).toEqual({ kind: "refused", message: UI_TEXT.replays.notReplayFile });
  });
});
