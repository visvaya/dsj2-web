import { updateCheckDue, type OfflineEvent } from "./offline-state";
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
  /** Calls the listener when the player comes back: the network returns or the page is shown again. */
  onReturn(listener: () => void): () => void;
  nowMs(): number;
}

/**
 * Registers the service worker and reports what follows, as events for `reduceOffline`. Returns a function
 * that stops the reports.
 *
 * The page never makes a waiting worker take over and never reloads itself: a newer release starts with the
 * next launch after every window of the game has been closed, so a jump is never interrupted.
 */
export function startOfflineSupport<W extends WorkerLike>(
  env: OfflineEnvironment<W>,
  report: (event: OfflineEvent) => void,
): () => void {
  let stopped = false;
  let lastCheckMs = env.nowMs();
  const emit = (event: OfflineEvent) => {
    if (!stopped) report(event);
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
      if (worker.state === "installed" && active !== null && active !== worker) emit("update-waiting");
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
      if (registration.waiting !== null) emit("update-waiting");
    }
    // A page opened while the first worker is stored but not yet active finds it waiting, not installing.
    const pending = registration.installing ?? registration.waiting;
    if (pending !== null) follow(registration, pending);
    registration.addEventListener("updatefound", () => {
      if (registration.installing !== null) follow(registration, registration.installing);
    });
  };

  let stopListening: (() => void) | null = null;
  void env.register().then(
    (registration) => {
      if (stopped) return;
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

  return () => {
    stopped = true;
    stopListening?.();
  };
}

function saysComplete(data: unknown): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, "complete") === true;
}

function askWorker(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, PWA_CONFIG.RELEASE_ANSWER_TIMEOUT_S * 1000);
    channel.port1.addEventListener("message", (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(saysComplete(event.data));
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
    holdsWholeRelease: askWorker,
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
  };
}
