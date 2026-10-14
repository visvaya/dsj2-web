/** Where a record lives: a database of its own with one object store, and the key of the record in it. */
export interface IdbPlace {
  db: string;
  store: string;
  key: string;
}

/** One record under a fixed key in IndexedDB. */
export interface IdbRecord {
  get: () => Promise<unknown>;
  put: (value: unknown) => Promise<void>;
  delete: () => Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB request failed")));
  });
}

function openDb(idb: IDBFactory, place: IdbPlace): Promise<IDBDatabase> {
  const req = idb.open(place.db, 1);
  req.addEventListener("upgradeneeded", () => {
    req.result.createObjectStore(place.store);
  });
  return request(req);
}

/** The record at `place`; each call opens the database, does one request and closes it again. */
export function idbRecord(idb: IDBFactory, place: IdbPlace): IdbRecord {
  const withStore = async <T>(
    mode: IDBTransactionMode,
    makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openDb(idb, place);
    try {
      return await request(makeRequest(db.transaction(place.store, mode).objectStore(place.store)));
    } finally {
      db.close();
    }
  };
  return {
    get: () => withStore("readonly", (s) => s.get(place.key)),
    put: async (value) => {
      await withStore("readwrite", (s) => s.put(value, place.key));
    },
    delete: async () => {
      await withStore("readwrite", (s) => s.delete(place.key));
    },
  };
}
