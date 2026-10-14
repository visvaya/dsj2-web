import type { HillChoice } from "../game/hill-choice";
import { ENGINE_REVISION, withKept, type Shelf, type ShelfEntry, type ShelfRefusal } from "../storage/replay-shelf";
import type { ReplaySource } from "./jump-replay";
import { playedResult } from "./shelf-replays";

/** What came of the replays of a file: the shelf with them, how many were added, how many were there already. */
export interface ImportOutcome {
  shelf: Shelf;
  added: number;
  alreadyKept: number;
  /** Why the rest could not be added: no room left. */
  refused: Exclude<ShelfRefusal, "alreadyKept"> | null;
}

/** Puts the replays of a file among the kept ones, each once, until there is no room left. */
export function importedShelf(shelf: Shelf, entries: readonly ShelfEntry[], now: Date): ImportOutcome {
  let current = shelf;
  let added = 0;
  let alreadyKept = 0;
  const stamp = now.toISOString();
  for (const [i, entry] of entries.entries()) {
    const outcome = withKept(current, { ...entry, kind: "kept", id: `import:${stamp}:${i}` });
    if (outcome.refused === "alreadyKept") alreadyKept++;
    else if (outcome.refused !== null) return { shelf: current, added, alreadyKept, refused: outcome.refused };
    else {
      current = outcome.shelf;
      added++;
    }
  }
  return { shelf: current, added, alreadyKept, refused: null };
}

/** A file's bytes as text the shelf keeps. */
export function base64Of(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

/**
 * A replay file of the original as the shelf keeps it, with the result it plays to on its hill; null when it never
 * ends (a file that only looks like a replay).
 */
export function originalEntry(hill: HillChoice, file: Uint8Array, source: ReplaySource, now: Date): ShelfEntry | null {
  const result = playedResult(source, hill);
  if (result === null) return null;
  const rpl = base64Of(file);
  return {
    id: `original:${hill.id}:${now.toISOString()}`,
    kind: "kept",
    hill: { id: hill.id, name: hill.name, kPointM: hill.kPointM },
    dateIso: now.toISOString(),
    result,
    newRecord: false,
    engineRevision: ENGINE_REVISION,
    replay:
      source.jumperName === undefined
        ? { kind: "original", rpl }
        : { kind: "original", rpl, jumperName: source.jumperName },
  };
}
