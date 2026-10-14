import { idbRecord } from "./idb-record";
import { field } from "./save-data";

/** The player's original game files, as far as they have been chosen. */
export interface GameFiles {
  exe?: Uint8Array;
  dat?: Uint8Array;
}

export const GAME_FILES_SCHEMA_VERSION = 1;

/** Keeps the game files between visits so the original hills load on their own. */
export interface GameFilesStore {
  /** "indexedDB" or "memory" (gone on reload). */
  readonly name: string;
  load(): Promise<GameFiles>;
  save(files: GameFiles): Promise<void>;
  clear(): Promise<void>;
}

function bytes(v: unknown): Uint8Array | undefined {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return undefined;
}

/** Reads a stored record; anything unknown or damaged yields no files. */
export function parseStoredGameFiles(v: unknown): GameFiles {
  if (field(v, "schemaVersion") !== GAME_FILES_SCHEMA_VERSION) return {};
  const exe = bytes(field(v, "exe"));
  const dat = bytes(field(v, "dat"));
  return { ...(exe ? { exe } : {}), ...(dat ? { dat } : {}) };
}

function record(files: GameFiles): object {
  return {
    schemaVersion: GAME_FILES_SCHEMA_VERSION,
    ...(files.exe ? { exe: files.exe } : {}),
    ...(files.dat ? { dat: files.dat } : {}),
  };
}

export function memoryGameFilesStore(): GameFilesStore {
  let stored: object | null = null;
  return {
    name: "memory",
    load: () => Promise.resolve(parseStoredGameFiles(stored)),
    save: (files) => {
      stored = record(files);
      return Promise.resolve();
    },
    clear: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}

/** The database of the game files; it predates this module's other stores and keeps its name. */
const GAME_FILES_PLACE = { db: "telemark", store: "files", key: "game" } as const;

function indexedDbStore(idb: IDBFactory): GameFilesStore {
  const stored = idbRecord(idb, GAME_FILES_PLACE);
  return {
    name: "indexedDB",
    load: async () => parseStoredGameFiles(await stored.get()),
    save: (files) => stored.put(record(files)),
    clear: () => stored.delete(),
  };
}

/**
 * IndexedDB when the browser offers it (files of several hundred kB do not fit localStorage's limits well),
 * otherwise memory. A store that fails later (blocked in a sandboxed frame) is replaced by `withFallback`.
 */
export function detectGameFilesStore(scope: { indexedDB?: IDBFactory } = globalThis): GameFilesStore {
  try {
    if (scope.indexedDB) return withFallback(indexedDbStore(scope.indexedDB));
  } catch {
    // Access to indexedDB itself can throw in locked-down frames.
  }
  return memoryGameFilesStore();
}

/** Uses `primary` until it fails once, then keeps the files in memory for the rest of the visit. */
export function withFallback(primary: GameFilesStore): GameFilesStore {
  let active = primary;
  const memory = memoryGameFilesStore();
  const run = async <T>(op: (store: GameFilesStore) => Promise<T>): Promise<T> => {
    try {
      return await op(active);
    } catch {
      active = memory;
      return op(active);
    }
  };
  return {
    get name() {
      return active.name;
    },
    load: () => run((s) => s.load()),
    save: (files) => run((s) => s.save(files)),
    clear: () => run((s) => s.clear()),
  };
}
