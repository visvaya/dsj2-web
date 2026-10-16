import { ENGINE_REVISION, type ShelfEntry } from "../replay-shelf";

/** A replay on the shelf for the tests, kept by hand unless `over` says otherwise. */
export function entry(id: string, over: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    id,
    kind: "kept",
    hill: { id: "own-1", name: "A", kPointM: 90 },
    dateIso: "2026-10-14T12:00:00.000Z",
    result: { distanceM: 88.5, points: 101.5, fell: false },
    newRecord: false,
    engineRevision: ENGINE_REVISION,
    replay: { kind: "own", seed: 42, inputs: "" },
    ...over,
  };
}

/** The replay of a hill record of the given distance. */
export const record = (id: string, distanceM: number, dateIso = "2026-10-14T12:00:00.000Z"): ShelfEntry =>
  entry(id, { kind: "record", dateIso, result: { distanceM, points: 100, fell: false } });
