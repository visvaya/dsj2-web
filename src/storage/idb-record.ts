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
  /**
   * Reads the record and writes what `change` makes of it, in one transaction, so no other window writes between;
   * gives back what was written. A throw in `change` leaves the record as it was.
   */
  update: (change: (current: unknown) => unknown) => Promise<unknown>;
  delete: () => Promise<void>;
}

/**
 * The longest an open of the database may take. An open waits without end while another tab holds the database
 * for an upgrade (or a deletion), and a store that never answers would hold up every later write behind it.
 */
export const IDB_TIMEOUT_MS = 5000;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB request failed")));
  });
}

/** The end of a transaction: a write is stored only once it completes (a full disk aborts it at the end). */
function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("abort", () => reject(tx.error ?? new Error("IndexedDB transaction aborted")));
    tx.addEventListener("error", () => reject(tx.error ?? new Error("IndexedDB transaction failed")));
  });
}

function openDb(idb: IDBFactory, place: IdbPlace): Promise<IDBDatabase> {
  const req = idb.open(place.db, 1);
  req.addEventListener("upgradeneeded", () => {
    req.result.createObjectStore(place.store);
  });
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`IndexedDB did not open within ${IDB_TIMEOUT_MS} ms`));
    }, IDB_TIMEOUT_MS);
    request(req).then(
      (db) => {
        clearTimeout(timer);
        // An open that finished after the store gave up on it is closed at once, so it holds nothing up.
        if (timedOut) {
          db.close();
          return;
        }
        // Another tab asking for a newer version waits for this connection: let it go.
        db.addEventListener("versionchange", () => db.close());
        resolve(db);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("IndexedDB did not open"));
      },
    );
  });
}

/** The record at `place`; each call opens the database, does one transaction and closes it again. */
export function idbRecord(idb: IDBFactory, place: IdbPlace): IdbRecord {
  const withStore = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>,
  ): Promise<T> => {
    const db = await openDb(idb, place);
    try {
      // Throws when the browser closed the connection meanwhile; the caller sees it as a failed operation.
      const tx = db.transaction(place.store, mode);
      const done = finished(tx);
      // A failure of the request also aborts the transaction; the request's error is the one reported.
      done.catch(() => undefined);
      const result = await work(tx.objectStore(place.store), tx);
      await done;
      return result;
    } finally {
      db.close();
    }
  };
  return {
    get: () => withStore("readonly", (s) => request(s.get(place.key))),
    put: async (value) => {
      await withStore("readwrite", (s) => request(s.put(value, place.key)));
    },
    update: (change) =>
      withStore("readwrite", async (s, tx) => {
        const current: unknown = await request(s.get(place.key));
        let next: unknown;
        try {
          next = change(current);
        } catch (error) {
          tx.abort();
          throw error;
        }
        await request(s.put(next, place.key));
        return next;
      }),
    delete: async () => {
      await withStore("readwrite", (s) => request(s.delete(place.key)));
    },
  };
}
