import { PWA_CONFIG } from "./pwa-config";

/**
 * Whether the game can start without a network: not yet known, yes (the active service worker holds a whole
 * release), or no (it could not be stored; the game still works online).
 */
type OfflineReadiness = "preparing" | "ready" | "unavailable";

export interface OfflineState {
  readiness: OfflineReadiness;
  /** A newer release is stored and takes over once every window of the game has been closed. */
  updateWaiting: boolean;
  /** The version of the game in that release, once its worker has told it; null before, or from an older worker. */
  updateVersion: string | null;
}

/**
 * "update-active": the release that was waiting has taken over, so there is nothing left to wait for. An
 * "update-version" names the version of the waiting release.
 */
export type OfflineEvent =
  | "ready"
  | "unavailable"
  | "update-waiting"
  | "update-active"
  | { type: "update-version"; version: string };

export const INITIAL_OFFLINE_STATE: OfflineState = {
  readiness: "preparing",
  updateWaiting: false,
  updateVersion: null,
};

export function reduceOffline(state: OfflineState, event: OfflineEvent): OfflineState {
  if (typeof event === "object") return { ...state, updateVersion: event.version };
  if (event === "update-waiting") return { ...state, updateWaiting: true };
  if (event === "update-active") return { ...state, updateWaiting: false, updateVersion: null };
  return { ...state, readiness: event };
}

/** What has to hold for the page to register a service worker at all. */
export interface OfflineConditions {
  /** A production build; the development server never registers one. */
  production: boolean;
  /** HTTPS or localhost. */
  secureContext: boolean;
  /** The browser has service workers. */
  supported: boolean;
  /** The page carries the marker of the regular build (not the single-file page). */
  marked: boolean;
}

export function offlineSupportWanted(conditions: OfflineConditions): boolean {
  return conditions.production && conditions.secureContext && conditions.supported && conditions.marked;
}

/** Whether enough time has passed since the last check for a new release. */
export function updateCheckDue(nowMs: number, lastCheckMs: number): boolean {
  return nowMs - lastCheckMs >= PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;
}
