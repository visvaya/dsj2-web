import { field } from "./save-data";
import { asShelfEntry, type ShelfEntry } from "./replay-shelf";

/**
 * A file of replays this game writes for another device or for safe keeping: the replays as the shelf keeps them,
 * under a name and a version of its own, so a file of anything else is told apart.
 */
const REPLAY_FILE_FORMAT = "telemark-replays";
const REPLAY_FILE_VERSION = 1;
/** Larger than any file of replays the shelf could fill (its budget is 5 MB); anything larger is not one. */
const REPLAY_FILE_MAX_BYTES = 6_000_000;

/** The text of a file of these replays. */
export function replayFileText(entries: readonly ShelfEntry[], now: Date): string {
  return JSON.stringify({
    format: REPLAY_FILE_FORMAT,
    formatVersion: REPLAY_FILE_VERSION,
    exportedAtIso: now.toISOString(),
    replays: entries,
  });
}

/** The name a file of replays is offered under. */
export function replayFileName(now: Date): string {
  return `telemark-powtorki-${now.toISOString().slice(0, 10)}.json`;
}

/** What a file of replays holds: the replays that could be read, and how many could not. */
export interface ReadReplayFile {
  entries: ShelfEntry[];
  unreadable: number;
}

/**
 * Reads a file of replays from the player's disk; null when it is not one (another file, another version). Each
 * replay is checked like a stored one: the file may come from anywhere.
 */
export function readReplayFile(text: string): ReadReplayFile | null {
  if (text.length > REPLAY_FILE_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const replays = field(parsed, "replays");
  if (field(parsed, "format") !== REPLAY_FILE_FORMAT || field(parsed, "formatVersion") !== REPLAY_FILE_VERSION) {
    return null;
  }
  if (!Array.isArray(replays)) return null;
  const entries = replays.map(asShelfEntry).filter((e): e is ShelfEntry => e !== null);
  return { entries, unreadable: replays.length - entries.length };
}
