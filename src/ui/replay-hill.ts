import { RETIRED_OWN_HILL_IDS } from "../game/hill-choice";
import type { ShelfEntry } from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.replays;

/** The hill of a replay as its row names it; a hill whose profile was replaced says so. */
export function replayHillLabel(entry: Pick<ShelfEntry, "hill">): string {
  const label = UI_TEXT.hillLabel(entry.hill.name, entry.hill.kPointM);
  return RETIRED_OWN_HILL_IDS.has(entry.hill.id) ? T.retiredHill(label) : label;
}

/**
 * Why a replay whose hill the game does not have cannot be watched: the hill's earlier profile, which is gone for
 * good, or a hill of the original, which comes back with the player's game files.
 */
export function missingHillNote(entry: Pick<ShelfEntry, "hill">): string {
  return RETIRED_OWN_HILL_IDS.has(entry.hill.id) ? T.hillRetired : T.hillMissing;
}
