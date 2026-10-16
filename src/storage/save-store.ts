import { field, mergedSave, parseSave, type SaveData } from "./save-data";

/** Where saves live; chosen at run time by `detectBackend`. */
export interface StorageBackend {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export const SAVE_KEY = "telemark.save";

/** The synchronous part of the Web Storage API that the game uses. */
export interface SyncKeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Host-provided async storage (window.storage) when present; values may come back wrapped. */
function hostBackend(store: object): StorageBackend | null {
  const get: unknown = Reflect.get(store, "get");
  const set: unknown = Reflect.get(store, "set");
  if (typeof get !== "function" || typeof set !== "function") return null;
  return {
    name: "window.storage",
    async get(key) {
      const v: unknown = await Reflect.apply(get, store, [key]);
      if (typeof v === "string") return v;
      const wrapped = field(v, "value");
      return typeof wrapped === "string" ? wrapped : null;
    },
    async set(key, value) {
      await Reflect.apply(set, store, [key, value]);
    },
  };
}

function localBackend(storage: SyncKeyValue): StorageBackend {
  return {
    name: "localStorage",
    get: (key) => Promise.resolve(storage.getItem(key)),
    set: (key, value) => {
      storage.setItem(key, value);
      return Promise.resolve();
    },
  };
}

export function memoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    name: "memory",
    get: (key) => Promise.resolve(map.get(key) ?? null),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

/** Picks the first storage that works: window.storage, then localStorage, then memory (lost on reload). */
export function detectBackend(scope: { storage?: unknown; localStorage?: SyncKeyValue } = globalThis): StorageBackend {
  const host = typeof scope.storage === "object" && scope.storage !== null ? hostBackend(scope.storage) : null;
  if (host) return host;
  try {
    const ls = scope.localStorage;
    if (ls) {
      const probe = `${SAVE_KEY}.probe`;
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return localBackend(ls);
    }
  } catch {
    // Storage disabled (private mode, blocked cookies): fall through.
  }
  return memoryBackend();
}

export async function loadSave(backend: StorageBackend): Promise<SaveData> {
  try {
    return parseSave(await backend.get(SAVE_KEY));
  } catch {
    return parseSave(null);
  }
}

/**
 * Stores the save merged with the stored one (see mergedSave), so a window holding an older save never writes over
 * a record another window stored; gives back what was stored, for the window to go on from.
 */
export async function saveSave(backend: StorageBackend, data: SaveData): Promise<SaveData> {
  const merged = mergedSave(await loadSave(backend), data);
  await backend.set(SAVE_KEY, JSON.stringify(merged));
  return merged;
}
