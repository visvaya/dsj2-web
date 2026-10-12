import { describe, expect, it } from "vitest";
import type { OfflineEvent } from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";
import { startOfflineSupport, type OfflineEnvironment, type RegistrationLike } from "./service-worker-client";

interface FakeWorker {
  state: ServiceWorkerState;
  /** What the worker answers when asked whether it holds its whole release. */
  whole: boolean;
  addEventListener(type: "statechange", listener: () => void): void;
  become(state: ServiceWorkerState): void;
}

function fakeWorker(state: ServiceWorkerState, whole = true): FakeWorker {
  const listeners: (() => void)[] = [];
  const worker: FakeWorker = {
    state,
    whole,
    addEventListener: (_type, listener) => listeners.push(listener),
    become(next) {
      worker.state = next;
      for (const listener of listeners) listener();
    },
  };
  return worker;
}

interface FakeRegistration extends RegistrationLike<FakeWorker> {
  installing: FakeWorker | null;
  waiting: FakeWorker | null;
  active: FakeWorker | null;
  updates: number;
  /** The browser has found a new worker and started to install it. */
  find(worker: FakeWorker): void;
  /** Moves a worker that is being installed up to the given state, as the browser does. */
  installTo(worker: FakeWorker, last: "installed" | "activated"): void;
}

function fakeRegistration(workers: Partial<Pick<FakeRegistration, "installing" | "waiting" | "active">>) {
  const listeners: (() => void)[] = [];
  const registration: FakeRegistration = {
    installing: null,
    waiting: null,
    active: null,
    ...workers,
    updates: 0,
    addEventListener: (_type, listener) => listeners.push(listener),
    update() {
      registration.updates += 1;
      return Promise.reject(new TypeError("no network"));
    },
    find(worker) {
      registration.installing = worker;
      for (const listener of listeners) listener();
    },
    installTo(worker, last) {
      registration.installing = null;
      registration.waiting = worker;
      worker.become("installed");
      if (last === "installed") return;
      registration.waiting = null;
      registration.active = worker;
      worker.become("activating");
      worker.become("activated");
    },
  };
  return registration;
}

interface Setup {
  events: OfflineEvent[];
  stop: () => void;
  /** The player comes back to the game. */
  comeBack: () => void;
  clock: { nowMs: number };
  listening: () => boolean;
}

function start(register: () => Promise<FakeRegistration>): Setup {
  const events: OfflineEvent[] = [];
  const clock = { nowMs: 0 };
  let returnListener: (() => void) | null = null;
  const env: OfflineEnvironment<FakeWorker> = {
    register,
    holdsWholeRelease: (worker) => Promise.resolve(worker.whole),
    onReturn(listener) {
      returnListener = listener;
      return () => {
        returnListener = null;
      };
    },
    nowMs: () => clock.nowMs,
  };
  const stop = startOfflineSupport(env, (event) => events.push(event));
  return { events, stop, comeBack: () => returnListener?.(), clock, listening: () => returnListener !== null };
}

/** Lets the promises settled so far run their reactions. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("startOfflineSupport", () => {
  it("promises nothing while the first worker installs, and is ready once it is active and whole", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual([]);

    registration.installTo(worker, "activated");
    await settle();
    expect(events).toEqual(["ready"]);
  });

  it("is unavailable when the first install fails", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    registration.installing = null;
    worker.become("redundant");
    await settle();
    expect(events).toEqual(["unavailable"]);
  });

  it("is unavailable when registering is refused", async () => {
    const { events } = start(() => Promise.reject(new Error("blocked")));
    await settle();
    expect(events).toEqual(["unavailable"]);
  });

  it("is ready at once on a later visit", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual(["ready"]);
  });

  it("is unavailable when the active worker has lost part of its release", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated", false) });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual(["unavailable"]);
  });

  it("reports an update that was already waiting when the page opened", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting: fakeWorker("installed") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events.toSorted()).toEqual(["ready", "update-waiting"]);
  });

  it("reports an update found while the page is open, once it is stored and waiting", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    expect(events).toEqual(["ready"]);

    registration.installTo(next, "installed");
    expect(events).toEqual(["ready", "update-waiting"]);
  });

  it("stays ready when an update fails to install", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    registration.installing = null;
    next.become("redundant");
    await settle();
    expect(events).toEqual(["ready"]);
  });

  it("checks for a new release when the player comes back, but not more often than the interval", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { comeBack, clock } = start(() => Promise.resolve(registration));
    await settle();
    const intervalMs = PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;

    comeBack();
    expect(registration.updates).toBe(0);
    clock.nowMs = intervalMs;
    comeBack();
    comeBack();
    expect(registration.updates).toBe(1);
    clock.nowMs = 2 * intervalMs;
    comeBack();
    expect(registration.updates).toBe(2);
    // The checks above were refused by the network; that must not surface as an unhandled rejection.
    await settle();
  });

  it("reports nothing and stops listening after it is stopped", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events, stop, listening } = start(() => Promise.resolve(registration));
    await settle();
    expect(listening()).toBe(true);
    stop();
    expect(listening()).toBe(false);
    registration.installTo(worker, "activated");
    await settle();
    expect(events).toEqual([]);
  });

  it("does not start listening when it was stopped before the registration arrived", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events, stop, listening } = start(() => Promise.resolve(registration));
    stop();
    await settle();
    expect(events).toEqual([]);
    expect(listening()).toBe(false);
  });
});
