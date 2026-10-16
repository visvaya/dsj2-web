import { afterEach, describe, expect, it, vi } from "vitest";
import { IDB_TIMEOUT_MS, idbRecord } from "./idb-record";

/** An IndexedDB whose open never finishes, as when another tab holds up an upgrade of the database. */
function blockedIndexedDb(): IDBFactory & { closed: () => boolean; finishOpen: () => void } {
  const listeners = new Map<string, () => void>();
  let closed = false;
  const db = {
    close: () => {
      closed = true;
    },
  };
  const req = {
    result: db,
    error: null,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the part of IDBFactory used
  const factory = { open: () => req } as unknown as IDBFactory;
  return Object.assign(factory, {
    closed: () => closed,
    finishOpen: () => listeners.get("success")?.(),
  });
}

describe("a record in IndexedDB", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on an open that does not finish, and closes the database should it open later", async () => {
    vi.useFakeTimers();
    const idb = blockedIndexedDb();
    const record = idbRecord(idb, { db: "d", store: "s", key: "k" });
    const read = record.get().then(
      () => "opened",
      (error: unknown) => (error instanceof Error ? error.message : "failed"),
    );
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS);
    expect(await read).toMatch(/did not open/);
    idb.finishOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(idb.closed()).toBe(true);
  });
});
