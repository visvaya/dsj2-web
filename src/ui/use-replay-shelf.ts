import { useEffect, useRef, useState } from "react";
import type { HillChoice } from "../game/hill-choice";
import {
  cleanedShelf,
  withKept,
  withRecent,
  withRecord,
  type Shelf,
  type ShelfCleanup,
  type ShelfRefusal,
} from "../storage/replay-shelf";
import { detectReplayStore, type ReplayStore } from "../storage/replay-store";
import type { ReplaySettings } from "../storage/save-data";
import type { FinishedJump } from "./jump-runs";
import { ownEntry, recordReplayOf } from "./shelf-replays";

const BYTES_PER_KB = 1000;

/** The clean-up the settings ask for, in the units of the shelf. */
function cleanupOf(settings: ReplaySettings): ShelfCleanup {
  return {
    maxAgeDays: settings.maxAgeDays,
    maxBytes: settings.maxSizeKb === null ? null : settings.maxSizeKb * BYTES_PER_KB,
  };
}

/**
 * The player's replays: read once from the store, then changed through `change`, which applies the clean-up of
 * the settings and stores the result. Changes made before the stored shelf has arrived are applied to it.
 */
export function useReplayShelf(settings: ReplaySettings) {
  const [store] = useState<ReplayStore>(detectReplayStore);
  const [shelf, setShelf] = useState<Shelf>([]);
  const [loaded, setLoaded] = useState(false);
  const { maxAgeDays, maxSizeKb } = settings;
  const cleanup = useRef(cleanupOf(settings));
  // A clean-up switched on or tightened applies to the shelf at once.
  useEffect(() => {
    cleanup.current = cleanupOf({ recentCount: 0, maxAgeDays, maxSizeKb });
    setShelf((current) => cleanedShelf(current, cleanup.current, new Date()));
  }, [maxAgeDays, maxSizeKb]);

  useEffect(() => {
    let cancelled = false;
    void store.load().then((stored) => {
      if (cancelled) return;
      setShelf((early) => cleanedShelf([...stored, ...early], cleanup.current, new Date()));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Stored after every change once the stored shelf is in, so nothing older is written over it.
  useEffect(() => {
    if (loaded) void store.save(shelf);
  }, [loaded, shelf, store]);

  /** Changes the shelf; the clean-up of the settings follows every change. */
  const change = (next: (current: Shelf) => Shelf) =>
    setShelf((current) => cleanedShelf(next(current), cleanup.current, new Date()));

  /** A training jump is over: the replay of a new record replaces the hill's last, and the last jumps follow. */
  const onJumpFinished = (hill: HillChoice, jump: FinishedJump, newRecord: boolean) => {
    const now = new Date();
    change((current) => {
      const recorded = newRecord ? withRecord(current, ownEntry("record", hill, jump, now)) : current;
      return settings.recentCount > 0
        ? withRecent(recorded, ownEntry("recent", hill, jump, now), settings.recentCount).shelf
        : recorded;
    });
  };

  /** Keeps a jump by hand; says whether it was kept, was kept before, or found no room. */
  const keepJump = (hill: HillChoice, jump: FinishedJump): KeepOutcome => {
    // Until the stored replays are in, what is already kept and what room is left are not known.
    if (!loaded) return "notReady";
    const entry = ownEntry("kept", hill, jump, new Date());
    const outcome = withKept(shelf, entry);
    if (outcome.refused !== null) return outcome.refused;
    change((current) => withKept(current, entry).shelf);
    return "kept";
  };

  const recordHillIds = new Set(shelf.filter((e) => e.kind === "record").map((e) => e.hill.id));
  return {
    shelf,
    change,
    onJumpFinished,
    keepJump,
    storeName: store.name,
    recordHillIds,
    recordReplay: (hill: HillChoice) => recordReplayOf(shelf, hill),
  };
}

/** What became of a jump the player asked to keep. */
export type KeepOutcome = "kept" | "notReady" | ShelfRefusal;
