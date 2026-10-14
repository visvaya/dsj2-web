import type { FrameInput } from "../sim/jump-logic";
import { field } from "./save-data";

/**
 * The player's replays, kept between visits: the replay of each hill record, the replays kept by hand and,
 * when the player asks for it, the last few jumps. Pure functions over an immutable list; the store keeps it.
 */
const REPLAY_SHELF_SCHEMA_VERSION = 1;

/**
 * Changes when a change of the simulation can change the jump a stored replay plays to. A replay is checked
 * against its stored result in any case; this tells the player why one no longer fits.
 */
export const ENGINE_REVISION = 1;

export const REPLAY_LIMITS = {
  /** Replays kept by hand; the hill records are not counted, one per hill however many hills there are. */
  KEPT_MAX_COUNT: 100,
  /** The most that "keep the last jumps" may keep. */
  RECENT_MAX_COUNT: 20,
  /** All replays together, as stored. */
  BUDGET_BYTES: 5_000_000,
} as const;

/** Why a replay is on the shelf: a hill record (kept on its own), kept by hand, or one of the last jumps. */
export type ShelfKind = "record" | "kept" | "recent";

/** What a replay plays: a jump of this game from its seed and inputs, or a file of the original as it was. */
type ShelfReplay =
  | { kind: "own"; seed: number; inputs: string }
  | { kind: "original"; rpl: string; jumperName?: string };

export interface ShelfEntry {
  id: string;
  kind: ShelfKind;
  hill: { id: string; name: string; kPointM: number };
  dateIso: string;
  result: { distanceM: number; points: number; fell: boolean };
  newRecord: boolean;
  engineRevision: number;
  replay: ShelfReplay;
}

export type Shelf = readonly ShelfEntry[];

/** Why a replay was not put on the shelf. */
export type ShelfRefusal = "alreadyKept" | "keptFull" | "budgetFull";

export type ShelfOutcome = { shelf: Shelf; refused: null } | { shelf: Shelf; refused: ShelfRefusal };

/** Bytes of a frame of input: the buttons, then the vertical motion as a signed byte. */
const FRAME_BYTES = 2;

/** The inputs of a jump as text: two bytes a frame, in base64. */
export function encodeInputs(inputs: readonly FrameInput[]): string {
  const bytes = new Uint8Array(inputs.length * FRAME_BYTES);
  inputs.forEach((input, i) => {
    bytes[i * FRAME_BYTES] = (input.left ? 1 : 0) | (input.right ? 2 : 0);
    bytes[i * FRAME_BYTES + 1] = input.dy & 0xff;
  });
  return btoa(String.fromCharCode(...bytes));
}

/** The inputs back from their text; null for text that is not what `encodeInputs` writes. */
export function decodeInputs(text: string): FrameInput[] | null {
  let raw: string;
  try {
    raw = atob(text);
  } catch {
    return null;
  }
  if (raw.length % FRAME_BYTES !== 0) return null;
  const inputs: FrameInput[] = [];
  for (let i = 0; i < raw.length; i += FRAME_BYTES) {
    const buttons = raw.charCodeAt(i);
    const motion = raw.charCodeAt(i + 1);
    if (buttons > 3) return null;
    inputs.push({ left: (buttons & 1) !== 0, right: (buttons & 2) !== 0, dy: motion > 127 ? motion - 256 : motion });
  }
  return inputs;
}

/** The size of one replay as it is stored, for the list to show. */
export function entryBytes(entry: ShelfEntry): number {
  return JSON.stringify(entry).length;
}

/** The size of the shelf as it is stored. */
export function shelfBytes(shelf: Shelf): number {
  return JSON.stringify(shelf).length;
}

const fits = (shelf: Shelf): boolean => shelfBytes(shelf) <= REPLAY_LIMITS.BUDGET_BYTES;

/** The replay of a new hill record: it takes the place of the hill's record before it. */
export function withRecord(shelf: Shelf, entry: ShelfEntry): Shelf {
  // Never refused: the hill's record has moved on, and its replay may take the shelf over the budget, as the
  // records alone may.
  return [...shelf.filter((e) => !(e.kind === "record" && e.hill.id === entry.hill.id)), { ...entry, kind: "record" }];
}

/** The same jump on the shelf, whatever kind it is kept as: the same seed and inputs, or the same file. */
export function sameReplay(a: ShelfEntry, b: ShelfEntry): boolean {
  if (a.replay.kind === "own" && b.replay.kind === "own") {
    return a.replay.seed === b.replay.seed && a.replay.inputs === b.replay.inputs;
  }
  return a.replay.kind === "original" && b.replay.kind === "original" && a.replay.rpl === b.replay.rpl;
}

/** A replay kept by hand; refused once the kept ones or the budget are full, so nothing goes on its own. */
export function withKept(shelf: Shelf, entry: ShelfEntry): ShelfOutcome {
  const kept = shelf.filter((e) => e.kind === "kept");
  if (kept.some((e) => sameReplay(e, entry))) return { shelf, refused: "alreadyKept" };
  if (kept.length >= REPLAY_LIMITS.KEPT_MAX_COUNT) return { shelf, refused: "keptFull" };
  const next = [...shelf, { ...entry, kind: "kept" as const }];
  return fits(next) ? { shelf: next, refused: null } : { shelf, refused: "budgetFull" };
}

/** One of the last jumps: only the newest `keep` stay (the player chose the number). */
export function withRecent(shelf: Shelf, entry: ShelfEntry, keep: number): ShelfOutcome {
  const count = Math.min(Math.max(0, keep), REPLAY_LIMITS.RECENT_MAX_COUNT);
  const recent = [...shelf.filter((e) => e.kind === "recent"), { ...entry, kind: "recent" as const }];
  const dropped = new Set(recent.slice(0, Math.max(0, recent.length - count)).map((e) => e.id));
  const next = [...shelf.filter((e) => e.kind !== "recent"), ...recent].filter((e) => !dropped.has(e.id));
  return fits(next) ? { shelf: next, refused: null } : { shelf, refused: "budgetFull" };
}

export function withoutEntries(shelf: Shelf, ids: ReadonlySet<string>): Shelf {
  return shelf.filter((e) => !ids.has(e.id));
}

/** The oldest `count` replays that are not hill records, to free room in one go. */
export function oldestRemovable(shelf: Shelf, count: number): Set<string> {
  const removable = shelf.filter((e) => e.kind !== "record").toSorted((a, b) => a.dateIso.localeCompare(b.dateIso));
  return new Set(removable.slice(0, Math.max(0, count)).map((e) => e.id));
}

const isText = (v: unknown): v is string => typeof v === "string";
/**
 * Longest texts an entry may hold: an id, a name, the inputs of a jump of 6000 frames and a file of the original
 * (1222 bytes), all as stored. Longer ones come from something else than this game.
 */
const MAX_TEXT_CHARS = { id: 200, name: 100, inputs: 16_000, rpl: 1700 } as const;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const SHELF_KINDS: readonly ShelfKind[] = ["record", "kept", "recent"];

function asReplay(v: unknown): ShelfReplay | null {
  const kind = field(v, "kind");
  if (kind === "own") {
    const seed = field(v, "seed");
    const inputs = field(v, "inputs");
    if (!isNumber(seed) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    if (!isText(inputs) || inputs.length > MAX_TEXT_CHARS.inputs || decodeInputs(inputs) === null) return null;
    return { kind, seed, inputs };
  }
  if (kind === "original") {
    const rpl = field(v, "rpl");
    const jumperName = field(v, "jumperName");
    if (!isText(rpl) || rpl.length > MAX_TEXT_CHARS.rpl) return null;
    return isText(jumperName) && jumperName.length <= MAX_TEXT_CHARS.name ? { kind, rpl, jumperName } : { kind, rpl };
  }
  return null;
}

/** One stored entry, checked field by field: the shelf comes from storage or from a file of another device. */
function asShelfEntry(v: unknown): ShelfEntry | null {
  const [id, kind, dateIso, newRecord, engineRevision] = ["id", "kind", "dateIso", "newRecord", "engineRevision"].map(
    (key) => field(v, key),
  );
  const hill = field(v, "hill");
  const result = field(v, "result");
  const replay = asReplay(field(v, "replay"));
  const [hillId, hillName, kPointM] = ["id", "name", "kPointM"].map((key) => field(hill, key));
  const [distanceM, points, fell] = ["distanceM", "points", "fell"].map((key) => field(result, key));
  if (!isText(id) || !SHELF_KINDS.some((k) => k === kind) || !isText(dateIso) || replay === null) return null;
  if (id.length > MAX_TEXT_CHARS.id || Number.isNaN(Date.parse(dateIso))) return null;
  if (!isText(hillId) || !isText(hillName) || !isNumber(kPointM)) return null;
  if (hillId.length > MAX_TEXT_CHARS.id || hillName.length > MAX_TEXT_CHARS.name) return null;
  if (!isNumber(distanceM) || !isNumber(points) || typeof fell !== "boolean") return null;
  if (typeof newRecord !== "boolean" || !isNumber(engineRevision)) return null;
  return {
    id,
    kind: SHELF_KINDS.find((k) => k === kind) ?? "kept",
    hill: { id: hillId, name: hillName, kPointM },
    dateIso,
    result: { distanceM, points, fell },
    newRecord,
    engineRevision,
    replay,
  };
}

/**
 * The stored shelf as far as it can be read. Entries that cannot be read are kept apart to be stored back as they
 * were, and a record of a version this game does not know is foreign: nothing may be written over it.
 */
export interface ReadShelf {
  shelf: Shelf;
  unreadable: readonly unknown[];
  foreign: boolean;
}

export function readShelf(v: unknown): ReadShelf {
  if (v === undefined || v === null) return { shelf: [], unreadable: [], foreign: false };
  const entries = field(v, "entries");
  if (field(v, "schemaVersion") !== REPLAY_SHELF_SCHEMA_VERSION || !Array.isArray(entries)) {
    return { shelf: [], unreadable: [], foreign: true };
  }
  const shelf: ShelfEntry[] = [];
  const unreadable: unknown[] = [];
  const ids = new Set<string>();
  const recordHills = new Set<string>();
  for (const raw of entries) {
    const entry = asShelfEntry(raw);
    // A second entry under an id, or a second record of a hill, is not one this game writes.
    const doubled =
      entry !== null && (ids.has(entry.id) || (entry.kind === "record" && recordHills.has(entry.hill.id)));
    if (entry === null || doubled) {
      unreadable.push(raw);
      continue;
    }
    ids.add(entry.id);
    if (entry.kind === "record") recordHills.add(entry.hill.id);
    shelf.push(entry);
  }
  return { shelf, unreadable, foreign: false };
}

/** The stored shelf as far as it can be read (see readShelf). */
export function parseShelf(v: unknown): Shelf {
  return readShelf(v).shelf;
}

/** The shelf as it is stored, with the entries it could not read put back as they were. */
export function shelfRecord(shelf: Shelf, unreadable: readonly unknown[] = []): object {
  return { schemaVersion: REPLAY_SHELF_SCHEMA_VERSION, entries: [...shelf, ...unreadable] };
}

/** The clean-up the player asked for in the settings; null leaves that rule off. */
export interface ShelfCleanup {
  maxAgeDays: number | null;
  maxBytes: number | null;
}

const DAY_MS = 86_400_000;

/**
 * The shelf after the player's clean-up: replays older than the age go, then the oldest go until the shelf is
 * within the size. Hill records never go on their own, so a shelf of records alone may stay over the size.
 */
export function cleanedShelf(shelf: Shelf, rules: ShelfCleanup, now: Date): Shelf {
  const maxAgeDays = rules.maxAgeDays;
  const fresh =
    maxAgeDays === null
      ? shelf
      : shelf.filter((e) => e.kind === "record" || now.getTime() - Date.parse(e.dateIso) <= maxAgeDays * DAY_MS);
  if (rules.maxBytes === null) return fresh;
  // The size is counted once and each removal takes off its entry and the comma before it in the stored list.
  let bytes = shelfBytes(fresh);
  const dropped = new Set<string>();
  const oldestFirst = fresh.filter((e) => e.kind !== "record").toSorted((a, b) => a.dateIso.localeCompare(b.dateIso));
  for (const entry of oldestFirst) {
    if (bytes <= rules.maxBytes) break;
    dropped.add(entry.id);
    bytes -= entryBytes(entry) + 1;
  }
  return withoutEntries(fresh, dropped);
}
