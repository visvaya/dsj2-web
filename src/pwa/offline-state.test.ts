import { describe, expect, it } from "vitest";
import { INITIAL_OFFLINE_STATE, offlineSupportWanted, reduceOffline, updateCheckDue } from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";

describe("reduceOffline", () => {
  it("starts without a promise of playing offline", () => {
    expect(INITIAL_OFFLINE_STATE).toEqual({ readiness: "preparing", updateWaiting: false });
  });

  it("becomes ready, or unavailable, and keeps a waiting update through both", () => {
    const waiting = reduceOffline(INITIAL_OFFLINE_STATE, "update-waiting");
    expect(waiting).toEqual({ readiness: "preparing", updateWaiting: true });
    expect(reduceOffline(waiting, "ready")).toEqual({ readiness: "ready", updateWaiting: true });
    expect(reduceOffline(waiting, "unavailable")).toEqual({ readiness: "unavailable", updateWaiting: true });
  });

  it("returns a new state and leaves the one it was given", () => {
    const before = { ...INITIAL_OFFLINE_STATE };
    const after = reduceOffline(INITIAL_OFFLINE_STATE, "ready");
    expect(after).not.toBe(INITIAL_OFFLINE_STATE);
    expect(INITIAL_OFFLINE_STATE).toEqual(before);
  });
});

describe("offlineSupportWanted", () => {
  const all = { production: true, secureContext: true, supported: true, marked: true };

  it("wants a service worker only when every condition holds", () => {
    expect(offlineSupportWanted(all)).toBe(true);
    expect(offlineSupportWanted({ ...all, production: false })).toBe(false);
    expect(offlineSupportWanted({ ...all, secureContext: false })).toBe(false);
    expect(offlineSupportWanted({ ...all, supported: false })).toBe(false);
  });

  it("does not want one on a page without the marker, even under HTTPS", () => {
    expect(offlineSupportWanted({ ...all, marked: false })).toBe(false);
  });
});

describe("updateCheckDue", () => {
  const intervalMs = PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;

  it("is due once the interval has passed, not before", () => {
    expect(updateCheckDue(1000 + intervalMs - 1, 1000)).toBe(false);
    expect(updateCheckDue(1000 + intervalMs, 1000)).toBe(true);
  });
});
