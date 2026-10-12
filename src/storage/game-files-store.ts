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

const DB_NAME = "telemark";
const DB_STORE = "files";
const DB_KEY = "game";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB request failed")));
  });
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  const req = idb.open(DB_NAME, 1);
  req.addEventListener("upgradeneeded", () => {
    req.result.createObjectStore(DB_STORE);
  });
  return request(req);
}

function indexedDbStore(idb: IDBFactory): GameFilesStore {
  const withStore = async <T>(
    mode: IDBTransactionMode,
    makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openDb(idb);
    try {
      return await request(makeRequest(db.transaction(DB_STORE, mode).objectStore(DB_STORE)));
    } finally {
      db.close();
    }
  };
  return {
    name: "indexedDB",
    load: async () => parseStoredGameFiles(await withStore("readonly", (s) => s.get(DB_KEY))),
    save: async (files) => {
      await withStore("readwrite", (s) => s.put(record(files), DB_KEY));
    },
    clear: async () => {
      await withStore("readwrite", (s) => s.delete(DB_KEY));
    },
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
