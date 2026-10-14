import type { HillChoice } from "../game/hill-choice";
import { ENGINE_REVISION, withKept, type Shelf, type ShelfEntry, type ShelfRefusal } from "../storage/replay-shelf";
import type { ReplaySource } from "./jump-replay";
import { entryPlaysTrue, playedResult, sourceOfEntry } from "./shelf-replays";

/** What came of the replays of a file: the shelf with them, how many were added, how many were there already. */
export interface ImportOutcome {
  shelf: Shelf;
  added: number;
  alreadyKept: number;
  /** Replays whose stored result is not what they play to: left out. */
  untrue: number;
  /** Why the rest could not be added: no room left. */
  refused: Exclude<ShelfRefusal, "alreadyKept"> | null;
}

/**
 * What a replay of a file is, checked against this game: the entry as it is to be kept (with the hill as this game
 * names it), or "untrue" when it plays to another result than it says, so the list never shows numbers a file
 * made up. A replay of a hill this game does not have now is kept unchecked; it is checked before it plays.
 */
export type ImportCheck = (entry: ShelfEntry) => ShelfEntry | "untrue";

/** Puts the replays of a file among the kept ones, each once and checked, until there is no room left. */
export function importedShelf(
  shelf: Shelf,
  entries: readonly ShelfEntry[],
  now: Date,
  check: ImportCheck,
): ImportOutcome {
  let current = shelf;
  let added = 0;
  let alreadyKept = 0;
  let untrue = 0;
  const stamp = now.toISOString();
  for (const [i, entry] of entries.entries()) {
    const checked = check(entry);
    if (checked === "untrue") {
      untrue++;
      continue;
    }
    const outcome = withKept(current, { ...checked, kind: "kept", id: `import:${stamp}:${i}` });
    if (outcome.refused === "alreadyKept") alreadyKept++;
    else if (outcome.refused !== null) return { shelf: current, added, alreadyKept, untrue, refused: outcome.refused };
    else {
      current = outcome.shelf;
      added++;
    }
  }
  return { shelf: current, added, alreadyKept, untrue, refused: null };
}

/** The check of an imported replay against the hills of this game. */
export function checkAgainst(hills: readonly HillChoice[]): ImportCheck {
  // Each replay is played through once, however many times the import is computed.
  const checked = new Map<ShelfEntry, ShelfEntry | "untrue">();
  const check = (entry: ShelfEntry): ShelfEntry | "untrue" => {
    const hill = hills.find((h) => h.id === entry.hill.id);
    if (!hill) return entry;
    const source = sourceOfEntry(entry);
    if (!source || !entryPlaysTrue(entry, source, hill)) return "untrue";
    return { ...entry, hill: { id: hill.id, name: hill.name, kPointM: hill.kPointM } };
  };
  return (entry) => {
    const known = checked.get(entry);
    if (known !== undefined) return known;
    const result = check(entry);
    checked.set(entry, result);
    return result;
  };
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
