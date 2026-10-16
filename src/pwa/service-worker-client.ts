import { updateCheckDue, type OfflineEvent, type UpdateCheckOutcome } from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";

/** The parts of a service worker, its registration and the browser that the page uses. */
export interface WorkerLike {
  readonly state: ServiceWorkerState;
  addEventListener(type: "statechange", listener: () => void): void;
}

export interface RegistrationLike<W extends WorkerLike> {
  readonly installing: W | null;
  readonly waiting: W | null;
  readonly active: W | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  update(): Promise<unknown>;
}

export interface OfflineEnvironment<W extends WorkerLike> {
  register(): Promise<RegistrationLike<W>>;
  /** Asks a worker whether it holds every file of its release. */
  holdsWholeRelease(worker: W): Promise<boolean>;
  /** Asks a worker which version of the game its release is; null when it does not say. */
  versionOf(worker: W): Promise<string | null>;
  /** Calls the listener when the player comes back: the network returns or the page is shown again. */
  onReturn(listener: () => void): () => void;
  nowMs(): number;
  /** Asks a waiting worker to take over now. */
  askToTakeOver(worker: W): void;
  /** Loads the page again. */
  reload(): void;
}

/** What the page can do with the service worker once it has started following it. */
export interface OfflineSupport {
  /** Stops the reports. */
  stop: () => void;
  /** Looks for a new release now and says what was found. */
  checkNow: () => Promise<UpdateCheckOutcome>;
  /**
   * Asks the waiting release to take over and reloads this page once it has; false when no release waits.
   * Only the page whose player asked reloads; other windows of the game are switched to the new worker and
   * keep running the code they started with.
   */
  installNow: () => boolean;
}

/**
 * Registers the service worker and reports what follows, as events for `reduceOffline`.
 *
 * On its own the page never makes a waiting worker take over and never reloads itself: a newer release starts
 * with the next launch after every window of the game has been closed, so a jump is never interrupted. Only
 * `installNow`, which the menus offer, makes it take over sooner.
 */
export function startOfflineSupport<W extends WorkerLike>(
  env: OfflineEnvironment<W>,
  report: (event: OfflineEvent) => void,
): OfflineSupport {
  let stopped = false;
  let lastCheckMs = env.nowMs();
  const emit = (event: OfflineEvent) => {
    if (!stopped) report(event);
  };
  /** Asks a waiting worker which version of the game it holds; an older one does not say. */
  const tellVersion = (worker: W | null) => {
    if (worker === null) return;
    void env.versionOf(worker).then(
      (version) => {
        if (version !== null) emit({ type: "update-version", version });
      },
      () => undefined,
    );
  };
  const confirm = (worker: W) => {
    void env.holdsWholeRelease(worker).then(
      (whole) => emit(whole ? "ready" : "unavailable"),
      () => emit("unavailable"),
    );
  };

  /** Follows a worker that is installing or waiting, to its activation or its failure. */
  const follow = (registration: RegistrationLike<W>, worker: W) => {
    worker.addEventListener("statechange", () => {
      const active = registration.active;
      if (worker.state === "installed" && active !== null && active !== worker) {
        emit("update-waiting");
        tellVersion(worker);
      }
      if (worker.state === "activated") {
        // On a page no worker answers for (a first visit), a new release takes over at once.
        emit("update-active");
        confirm(worker);
      }
      // A first install that failed; a failed update leaves the active worker and its release as they were.
      if (worker.state === "redundant" && active === null) emit("unavailable");
    });
  };

  const watch = (registration: RegistrationLike<W>) => {
    if (registration.active !== null) {
      confirm(registration.active);
      if (registration.waiting !== null) {
        emit("update-waiting");
        tellVersion(registration.waiting);
      }
    }
    // A page opened while the first worker is stored but not yet active finds it waiting, not installing.
    const pending = registration.installing ?? registration.waiting;
    if (pending !== null) follow(registration, pending);
    registration.addEventListener("updatefound", () => {
      if (registration.installing !== null) follow(registration, registration.installing);
    });
  };

  let stopListening: (() => void) | null = null;
  let current: RegistrationLike<W> | null = null;
  const registered = env.register();
  void registered.then(
    (registration) => {
      if (stopped) return;
      current = registration;
      watch(registration);
      stopListening = env.onReturn(() => {
        const nowMs = env.nowMs();
        if (!updateCheckDue(nowMs, lastCheckMs)) return;
        lastCheckMs = nowMs;
        // No network is an expected answer here, not an error.
        registration.update().catch(() => undefined);
      });
    },
    () => emit("unavailable"),
  );

  const checkNow = async (): Promise<UpdateCheckOutcome> => {
    const registration = await registered.catch(() => null);
    if (registration === null) return "unavailable";
    lastCheckMs = env.nowMs();
    try {
      await registration.update();
    } catch {
      // The browser does not tell a missing network from a server that did not answer.
      return "unreachable";
    }
    const newer = registration.installing ?? registration.waiting;
    return registration.active !== null && newer !== null ? "found" : "latest";
  };

  let askedWorker: W | null = null;
  let reloading = false;
  const installNow = (): boolean => {
    const waiting = current?.waiting ?? null;
    if (stopped || waiting === null) return false;
    if (askedWorker !== waiting) {
      askedWorker = waiting;
      // Followed by its own state, not by the page's controller: a page loaded past the worker (a forced
      // reload) has no controller to change, and is reloaded all the same.
      waiting.addEventListener("statechange", () => {
        if (waiting.state !== "activated" || reloading) return;
        reloading = true;
        env.reload();
      });
    }
    env.askToTakeOver(waiting);
    return true;
  };

  return {
    stop: () => {
      stopped = true;
      stopListening?.();
    },
    checkNow,
    installNow,
  };
}

function saysComplete(data: unknown): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, "complete") === true;
}

/** The version a worker's answer names: a short text such as "0.10.0", or null. */
export function versionIn(data: unknown): string | null {
  const version: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "version") : null;
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

/** What a worker tells about its release; null when it does not answer in time. */
function askWorker(worker: ServiceWorker): Promise<unknown> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, PWA_CONFIG.RELEASE_ANSWER_TIMEOUT_S * 1000);
    channel.port1.addEventListener("message", (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    });
    channel.port1.start();
    worker.postMessage({ type: PWA_CONFIG.RELEASE_MESSAGE_TYPE }, [channel.port2]);
  });
}

/** The environment of a real page. */
export function browserOfflineEnvironment(container: ServiceWorkerContainer): OfflineEnvironment<ServiceWorker> {
  return {
    register: () =>
      container.register(PWA_CONFIG.SERVICE_WORKER_URL, {
        scope: PWA_CONFIG.SERVICE_WORKER_SCOPE,
        // The browser's own cache never answers for the worker's script.
        updateViaCache: "none",
      }),
    holdsWholeRelease: (worker) => askWorker(worker).then(saysComplete),
    versionOf: (worker) => askWorker(worker).then(versionIn),
    onReturn(listener) {
      const onVisibility = () => {
        if (!document.hidden) listener();
      };
      window.addEventListener("online", listener);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("online", listener);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    nowMs: () => performance.now(),
    askToTakeOver: (worker) => worker.postMessage({ type: PWA_CONFIG.TAKE_OVER_MESSAGE_TYPE }, []),
    reload: () => window.location.reload(),
  };
}
