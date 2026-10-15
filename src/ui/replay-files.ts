import type { HillChoice } from "../game/hill-choice";
import {
  REPLAY_FILE_MAX_ENTRIES,
  readReplayFile,
  replayArchiveName,
  replayFileName,
  replayFileText,
} from "../storage/replay-file";
import type { ShelfEntry } from "../storage/replay-shelf";
import { looksLikeZip, readZip, zipFile, type ZipEntry } from "../storage/zip-file";
import { UI_TEXT } from "../text/ui-text";
import type { ReplaySource } from "./jump-replay";
import { originalReplayOutcome } from "./original-replay-choice";
import { originalEntry } from "./replay-import";

const T = UI_TEXT.replays;
const encoder = new TextEncoder();

/** A second file of the same name in an archive gets "-2", "-3"... before its extension. */
function distinctNames(files: readonly ZipEntry[]): ZipEntry[] {
  const taken = new Set<string>();
  return files.map((file) => {
    const dot = file.name.lastIndexOf(".");
    let name = file.name;
    for (let n = 2; taken.has(name); n++) name = `${file.name.slice(0, dot)}-${n}${file.name.slice(dot)}`;
    taken.add(name);
    return { ...file, name };
  });
}

/**
 * The selected replays as a file to hand over: one replay as its own file, several as a ZIP archive with a file
 * for each, so each one can be passed on alone.
 */
export function exportedReplaysFile(entries: readonly ShelfEntry[], now: Date): File {
  const [single] = entries;
  if (entries.length === 1 && single) {
    return new File([replayFileText([single], now)], replayFileName(single), { type: "application/json" });
  }
  const files = entries.map((entry) => ({
    name: replayFileName(entry),
    bytes: encoder.encode(replayFileText([entry], now)),
  }));
  return new File([zipFile(distinctNames(files))], replayArchiveName(now), { type: "application/zip" });
}

/** What a chosen file holds, before any of it is put on the shelf. */
export type ReadFile =
  /** Replays of this game and files of the original (from an archive): to be put among the read ones. */
  | { kind: "replays"; entries: ShelfEntry[]; unreadable: number; skipped: number }
  /** One file of the original: put among the read ones and played at once. */
  | { kind: "original"; entry: ShelfEntry | null; hill: HillChoice; source: ReplaySource }
  | { kind: "refused"; message: string };

const isReplayFile = (name: string): boolean => name.toLowerCase().endsWith(".json");

/** The files of an archive: the replays of this game in it, and the files of the original that play. */
async function readArchive(bytes: Uint8Array<ArrayBuffer>, originalHills: readonly HillChoice[], now: Date) {
  const files = await readZip(bytes);
  if (files === null) return { kind: "refused", message: T.notReplayFile } as const;
  const entries: ShelfEntry[] = [];
  let unreadable = 0;
  let skipped = 0;
  for (const file of files) {
    const replays = isReplayFile(file.name) ? readReplayFile(new TextDecoder().decode(file.bytes)) : null;
    const original = replays === null ? originalReplayOutcome(file.bytes, originalHills) : null;
    const entry = original?.ok === true ? originalEntry(original.hill, file.bytes, original.source, now) : null;
    if (replays) {
      entries.push(...replays.entries);
      unreadable += replays.unreadable;
    } else if (entry) entries.push(entry);
    else skipped++;
  }
  // Every replay is played through to check it, so the archive as a whole gives no more than one file may.
  const extra = Math.max(0, entries.length - REPLAY_FILE_MAX_ENTRIES);
  return {
    kind: "replays",
    entries: entries.slice(0, REPLAY_FILE_MAX_ENTRIES),
    unreadable: unreadable + extra,
    skipped,
  } as const;
}

/**
 * Reads a file the player chose: a file of replays of this game, an archive of such files and of files of the
 * original, or one file of the original. Everything is checked on the shelf as a stored replay is.
 */
export async function readChosenFile(
  bytes: Uint8Array<ArrayBuffer>,
  originalHills: readonly HillChoice[],
  now: Date,
): Promise<ReadFile> {
  if (looksLikeZip(bytes)) return readArchive(bytes, originalHills, now);
  const replays = readReplayFile(new TextDecoder().decode(bytes));
  if (replays) return { kind: "replays", entries: replays.entries, unreadable: replays.unreadable, skipped: 0 };
  const original = originalReplayOutcome(bytes, originalHills);
  if (!original.ok) {
    return { kind: "refused", message: original.message === T.notReplay ? T.notReplayFile : original.message };
  }
  const entry = originalEntry(original.hill, bytes, original.source, now);
  return { kind: "original", entry, hill: original.hill, source: original.source };
}
