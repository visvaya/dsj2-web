import { field } from "./save-data";
import { asShelfEntry, type ShelfEntry } from "./replay-shelf";

/**
 * A file of replays this game writes for another device or for safe keeping: the replays as the shelf keeps them,
 * under a name and a version of its own, so a file of anything else is told apart.
 */
const REPLAY_FILE_FORMAT = "telemark-replays";
/** Version 2 writes the input in the compact form of input-codec.ts; version 1 files are read as well. */
const REPLAY_FILE_VERSION = 2;
const READ_VERSIONS: readonly number[] = [1, 2];
/** Larger than any file of replays the shelf could fill (its budget is 5 MB); anything larger is not one. */
export const REPLAY_FILE_MAX_BYTES = 6_000_000;

/** The text of a file of these replays. */
export function replayFileText(entries: readonly ShelfEntry[], now: Date): string {
  return JSON.stringify({
    format: REPLAY_FILE_FORMAT,
    formatVersion: REPLAY_FILE_VERSION,
    exportedAtIso: now.toISOString(),
    replays: entries,
  });
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The local day and time to the second, as a file name takes them: 2026-10-15_08-47-12. */
export function fileStamp(now: Date): string {
  const day = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `${day}_${[now.getHours(), now.getMinutes(), now.getSeconds()].map(pad2).join("-")}`;
}

/** A name as plain lower-case letters and digits joined by hyphens, for a file name on any system. */
export function fileNamePart(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .replaceAll("\u0142", "l")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

/**
 * The name the file of one replay is offered under, in sections joined by "_": the game, the local day and time of
 * the jump to the second, and the hill. The jumper's name is to join them once players can name themselves.
 */
export function replayFileName(entry: ShelfEntry): string {
  const hill = fileNamePart(`${entry.hill.name} K${entry.hill.kPointM}`);
  return `telemark-powtorka_${fileStamp(new Date(entry.dateIso))}_${hill}.json`;
}

/** The name an archive of several replays is offered under: the local day and time of the export. */
export const replayArchiveName = (now: Date): string => `telemark-powtorki_${fileStamp(now)}.zip`;

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
  const version = field(parsed, "formatVersion");
  if (field(parsed, "format") !== REPLAY_FILE_FORMAT || !READ_VERSIONS.some((known) => known === version)) {
    return null;
  }
  if (!Array.isArray(replays)) return null;
  const entries = replays.map(asShelfEntry).filter((e): e is ShelfEntry => e !== null);
  return { entries, unreadable: replays.length - entries.length };
}
