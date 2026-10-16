import type { Shelf, ShelfEntry } from "./replay-shelf";
import { betterRecordOf } from "./save-data";

/**
 * What one window did to the shelf since it opened, so that its write can be merged with what other windows of
 * the game stored meanwhile: the entries it added and the entries it deleted, both until a write stores them.
 */
export interface ShelfJournal {
  added: ReadonlySet<string>;
  deleted: ReadonlySet<string>;
}

export const EMPTY_JOURNAL: ShelfJournal = { added: new Set(), deleted: new Set() };

/**
 * The journal after the window's shelf went from `before` to `after`. A replay of a record put in the place of the
 * hill's record before it does not delete that one: which of the two stands is the merge's to say (see
 * mergedShelf), as another window may hold a longer record than the save of this one knew.
 */
export function journalAfter(journal: ShelfJournal, before: Shelf, after: Shelf): ShelfJournal {
  const afterIds = new Set(after.map((e) => e.id));
  const recordHills = new Set(after.filter((e) => e.kind === "record").map((e) => e.hill.id));
  const replaced = (e: ShelfEntry) => e.kind === "record" && recordHills.has(e.hill.id);
  const beforeIds = new Set(before.map((e) => e.id));
  const removedIds = new Set(before.filter((e) => !afterIds.has(e.id) && !replaced(e)).map((e) => e.id));
  const added = new Set(journal.added);
  const deleted = new Set(journal.deleted);
  for (const id of afterIds) {
    if (beforeIds.has(id)) continue;
    added.add(id);
    deleted.delete(id);
  }
  for (const id of removedIds) {
    deleted.add(id);
    added.delete(id);
  }
  return { added, deleted };
}

/**
 * The journal once a write that started from `sent` is stored: the merge has decided the fate of every addition it
 * took (stored, or dropped as the replay of a record that lost to a longer one) and every deletion is in the store,
 * so both leave the journal; what the window changed while the write ran stays for the next write. A deletion kept
 * beyond its write is not needed: another window holding the entry drops it, as one stored once and gone since.
 */
export function journalAfterWrite(journal: ShelfJournal, sent: ShelfJournal): ShelfJournal {
  return {
    added: new Set([...journal.added].filter((id) => !sent.added.has(id))),
    deleted: new Set([...journal.deleted].filter((id) => !sent.deleted.has(id))),
  };
}

/** Of two replays of a hill record, the one of the record that stands (betterRecordOf, as for the save). */
function betterRecord(a: ShelfEntry, b: ShelfEntry): ShelfEntry {
  const first = { distanceM: a.result.distanceM, dateIso: a.dateIso };
  return betterRecordOf(first, { distanceM: b.result.distanceM, dateIso: b.dateIso }) === "first" ? a : b;
}

/**
 * The shelf to store when a window writes `mine` over `stored`: what is stored stays unless this window deleted
 * it; of the window's own entries that are not stored, only those it added and has not stored yet go in (any
 * other was stored once and deleted by another window since). One replay of a record per hill stays, the better.
 */
export function mergedShelf(stored: Shelf, mine: Shelf, journal: ShelfJournal): Shelf {
  const storedIds = new Set(stored.map((e) => e.id));
  const mineIds = new Set(mine.map((e) => e.id));
  const union = [
    ...mine.filter((e) => (storedIds.has(e.id) ? !journal.deleted.has(e.id) : journal.added.has(e.id))),
    ...stored.filter((e) => !mineIds.has(e.id) && !journal.deleted.has(e.id)),
  ];
  const records = new Map<string, ShelfEntry>();
  for (const e of union) {
    if (e.kind !== "record") continue;
    const held = records.get(e.hill.id);
    records.set(e.hill.id, held === undefined ? e : betterRecord(held, e));
  }
  return union.filter((e) => e.kind !== "record" || records.get(e.hill.id) === e);
}
