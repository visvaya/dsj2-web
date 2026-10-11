/** Persistent data of the game, versioned so older saves can be migrated. */
export const SAVE_SCHEMA_VERSION = 1;

export interface HillRecord {
  distanceM: number;
  points: number;
  /** ISO 8601 time of the jump. */
  dateIso: string;
}

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  /** Best jump per hill id (see HillChoice.id). */
  records: Record<string, HillRecord>;
}

export function emptySave(): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, records: {} };
}

/** Property of an unknown value, without assuming its type. */
export function field(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;
}

function asRecord(v: unknown): HillRecord | null {
  const distanceM = field(v, "distanceM");
  const points = field(v, "points");
  const dateIso = field(v, "dateIso");
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM)) return null;
  if (typeof points !== "number" || !Number.isFinite(points)) return null;
  if (typeof dateIso !== "string") return null;
  return { distanceM, points, dateIso };
}

/** Reads stored JSON; anything unreadable or from an unknown version yields an empty save. */
export function parseSave(json: string | null): SaveData {
  if (json === null) return emptySave();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptySave();
  }
  if (field(raw, "schemaVersion") !== SAVE_SCHEMA_VERSION) return emptySave();
  const records: Record<string, HillRecord> = {};
  const stored = field(raw, "records");
  if (typeof stored === "object" && stored !== null) {
    for (const [id, value] of Object.entries(stored)) {
      const rec = asRecord(value);
      if (rec) records[id] = rec;
    }
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, records };
}

/** Returns a new save with the jump stored if it beats the hill record (falls never count). */
export function withJump(save: SaveData, hillId: string, jump: { distanceM: number; points: number; fell: boolean }, now: Date): SaveData {
  const best = save.records[hillId];
  if (jump.fell || !(jump.distanceM > 0) || (best && best.distanceM >= jump.distanceM)) return save;
  return {
    ...save,
    records: { ...save.records, [hillId]: { distanceM: jump.distanceM, points: jump.points, dateIso: now.toISOString() } },
  };
}
