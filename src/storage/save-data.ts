import { DEFAULT_OUTFIT, parseOutfit, type Outfit } from "../game/outfit";

/** Persistent data of the game, versioned so older saves can be migrated. */
export const SAVE_SCHEMA_VERSION = 2;

export interface HillRecord {
  distanceM: number;
  points: number;
  /** ISO 8601 time of the jump. */
  dateIso: string;
}

export type LeanControl = "drag" | "tilt";
/** Time of day of the hills: chosen at random per visit, or a fixed one. */
export type SceneryChoice = "varied" | "day" | "dusk" | "night";

export interface Settings {
  /** How a touch screen leans the jumper: dragging the left pad or tilting the phone. */
  leanControl: LeanControl;
  vibration: boolean;
  /** Added after version 2 was introduced; older saves read it as the default. */
  scenery: SceneryChoice;
  /** The player's colours (added after version 2 too). */
  outfit: Outfit;
  /** Game sounds (added after version 2 too; on by default). */
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { leanControl: "drag", vibration: true, scenery: "varied", outfit: DEFAULT_OUTFIT, sound: true };

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  /** Best jump per hill id (see HillChoice.id). */
  records: Record<string, HillRecord>;
  settings: Settings;
}

export function emptySave(): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, records: {}, settings: { ...DEFAULT_SETTINGS } };
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
  const version = field(raw, "schemaVersion");
  // Version 1 had records only; version 2 adds settings.
  if (version !== 1 && version !== SAVE_SCHEMA_VERSION) return emptySave();
  const records: Record<string, HillRecord> = {};
  const stored = field(raw, "records");
  if (typeof stored === "object" && stored !== null) {
    for (const [id, value] of Object.entries(stored)) {
      const rec = asRecord(value);
      if (rec) records[id] = rec;
    }
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, records, settings: parseSettings(field(raw, "settings")) };
}

function parseSettings(v: unknown): Settings {
  const lean = field(v, "leanControl");
  const vibration = field(v, "vibration");
  const scenery = field(v, "scenery");
  const sound = field(v, "sound");
  return {
    leanControl: lean === "tilt" || lean === "drag" ? lean : DEFAULT_SETTINGS.leanControl,
    vibration: typeof vibration === "boolean" ? vibration : DEFAULT_SETTINGS.vibration,
    scenery: scenery === "varied" || scenery === "day" || scenery === "dusk" || scenery === "night" ? scenery : DEFAULT_SETTINGS.scenery,
    outfit: parseOutfit(field(v, "outfit")),
    sound: typeof sound === "boolean" ? sound : DEFAULT_SETTINGS.sound,
  };
}

export function withSettings(save: SaveData, change: Partial<Settings>): SaveData {
  return { ...save, settings: { ...save.settings, ...change } };
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
