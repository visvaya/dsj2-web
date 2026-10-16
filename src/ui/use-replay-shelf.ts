import { useEffect, useMemo, useRef, useState } from "react";
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
import { mergedShelf } from "../storage/shelf-merge";
import type { ReplaySettings } from "../storage/save-data";
import type { ReplaySource } from "./jump-replay";
import type { FinishedJump } from "./jump-runs";
import { ownEntry, recordReplayOf, slimRecording } from "./shelf-replays";
import { shelfSync } from "./shelf-sync";

const BYTES_PER_KB = 1000;

/** The clean-up the settings ask for, in the units of the shelf. */
function cleanupOf(settings: Pick<ReplaySettings, "maxAgeDays" | "maxSizeKb">): ShelfCleanup {
  return {
    maxAgeDays: settings.maxAgeDays,
    maxBytes: settings.maxSizeKb === null ? null : settings.maxSizeKb * BYTES_PER_KB,
  };
}

/**
 * The player's replays: read from the store, then changed through `change`, which applies the clean-up of the
 * settings and stores the result. Changes made before the stored shelf has arrived are applied to it. The shelf is
 * kept in step with the other windows of the game (see shelfSync).
 */
export function useReplayShelf(settings: ReplaySettings) {
  const [store] = useState<ReplayStore>(detectReplayStore);
  const [shelf, setShelf] = useState<Shelf>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeName, setStoreName] = useState(store.name);
  // Whether the browser offers a store at all; where it does not, the replays screen says so on its own.
  const [offered] = useState(() => store.name !== "memory");
  const { maxAgeDays, maxSizeKb } = settings;
  const cleanup = useRef(cleanupOf(settings));
  // oxlint-disable-next-line react/refs -- the clean-up reads the ref when a shelf is taken from the store, not in a render
  const [sync] = useState(() =>
    shelfSync(store, {
      setShelf,
      setStoreName,
      clean: (taken) => cleanedShelf(taken, cleanup.current, new Date()),
    }),
  );

  /** Changes the shelf; the clean-up of the settings follows every change. */
  const change = (next: (current: Shelf) => Shelf) =>
    setShelf((current) => {
      const after = cleanedShelf(next(current), cleanup.current, new Date());
      sync.changed(current, after);
      return after;
    });

  // A clean-up switched on or tightened applies to the shelf at once.
  useEffect(() => {
    cleanup.current = cleanupOf({ maxAgeDays, maxSizeKb });
    setShelf((current) => {
      const after = cleanedShelf(current, cleanup.current, new Date());
      sync.changed(current, after);
      return after;
    });
  }, [maxAgeDays, maxSizeKb, sync]);

  useEffect(() => {
    let cancelled = false;
    // A first read that fails leaves the shelf empty for now: writes still merge with the store, and the read is
    // tried again after a while and on every return to the page.
    const failed = () => {
      if (cancelled) return;
      setStoreName(store.name);
      setLoaded(true);
      sync.readLater();
    };
    store.load().then((stored) => {
      if (cancelled) return;
      setShelf((early) => {
        // What came from the store is not this window's addition: from the merged shelf only the clean-up counts.
        const merged = mergedShelf(stored, early, sync.journal());
        const after = cleanedShelf(merged, cleanup.current, new Date());
        sync.changed(merged, after);
        return after;
      });
      setStoreName(store.name);
      setLoaded(true);
    }, failed);
    return () => {
      cancelled = true;
    };
  }, [store, sync]);

  useEffect(() => (loaded ? sync.connect() : undefined), [loaded, sync]);

  // Stored after every change once the stored shelf is in, so nothing older is written over it.
  useEffect(() => {
    if (loaded) sync.shown(shelf);
  }, [loaded, shelf, sync]);

  /**
   * A training jump is over: the replay of a new record replaces the hill's last, and the last jumps follow. The
   * recording is slimmed first, which plays the jump twice: after the frame that ended it, not within it.
   */
  const onJumpFinished = (hill: HillChoice, finished: FinishedJump, newRecord: boolean) => {
    const now = new Date();
    setTimeout(() => {
      const jump = { ...finished, recording: slimRecording(hill, finished.recording) };
      change((current) => {
        const recorded = newRecord ? withRecord(current, ownEntry("record", hill, jump, now)) : current;
        return settings.recentCount > 0
          ? withRecent(recorded, ownEntry("recent", hill, jump, now), settings.recentCount).shelf
          : recorded;
      });
    }, 0);
  };

  /** Keeps a jump by hand; says whether it was kept, was kept before, or found no room. */
  const keepJump = (hill: HillChoice, jump: FinishedJump): KeepOutcome => {
    // Until the stored replays are in, what is already kept and what room is left are not known.
    if (!loaded) return "notReady";
    const entry = ownEntry("kept", hill, { ...jump, recording: slimRecording(hill, jump.recording) }, new Date());
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
    storeName,
    /** The browser offers a store, but writes to it keep failing: the replays of this visit may not outlast it. */
    notStored: offered && storeName === "memory",
    recordHillIds,
    recordReplay: (hill: HillChoice) => recordReplayOf(shelf, hill),
  };
}

/** What became of a jump the player asked to keep. */
export type KeepOutcome = "kept" | "notReady" | ShelfRefusal;

/**
 * The replay of a hill's record, to run beside the training jumps as a ghost; null when the hill has none, it no
 * longer plays to its result, or the ghost is off. Worked out again only when that record changes.
 */
export function useRecordGhost(shelf: Shelf, hill: HillChoice | null, on: boolean): ReplaySource | null {
  const entry = hill === null ? undefined : shelf.find((e) => e.kind === "record" && e.hill.id === hill.id);
  return useMemo(() => (on && hill && entry ? recordReplayOf([entry], hill) : null), [on, hill, entry]);
}
