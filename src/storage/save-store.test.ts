import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, emptySave, parseSave, withJump, withSettings } from "./save-data";
import { SAVE_KEY, detectBackend, loadSave, memoryBackend, saveSave } from "./save-store";

const NOW = new Date("2026-10-11T10:00:00Z");

describe("save data", () => {
  it("keeps the best clean jump per hill", () => {
    let save = emptySave();
    save = withJump(save, "own-1", { distanceM: 80, points: 100, fell: false }, NOW);
    save = withJump(save, "own-1", { distanceM: 75, points: 90, fell: false }, NOW);
    save = withJump(save, "own-1", { distanceM: 95, points: 120, fell: true }, NOW);
    expect(save.records["own-1"]).toEqual({ distanceM: 80, points: 100, dateIso: NOW.toISOString() });
  });

  it("reads back what it writes and ignores broken or foreign data", () => {
    const save = withJump(emptySave(), "original-35", { distanceM: 89.92, points: 128.5, fell: false }, NOW);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    expect(parseSave("not json")).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ schemaVersion: 99, records: {} }))).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ schemaVersion: 1, records: { a: { distanceM: "x" } } }))).toEqual(emptySave());
  });

  it("migrates version 1 saves and keeps their records", () => {
    const v1 = { schemaVersion: 1, records: { "own-1": { distanceM: 80, points: 100, dateIso: NOW.toISOString() } } };
    const save = parseSave(JSON.stringify(v1));
    expect(save.schemaVersion).toBe(2);
    expect(save.records).toEqual(v1.records);
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("stores settings and repairs unknown values", () => {
    const outfit = { pants: 1, sleeves: 2, gloves: 3, helmet: 4, skis: 11 };
    const save = withSettings(emptySave(), {
      leanControl: "tilt",
      vibration: false,
      scenery: "night",
      outfit,
      sound: false,
    });
    expect(parseSave(JSON.stringify(save)).settings).toEqual({
      leanControl: "tilt",
      vibration: false,
      scenery: "night",
      outfit,
      sound: false,
    });
    const broken = {
      ...save,
      settings: {
        leanControl: "joystick",
        vibration: "yes",
        scenery: "dawn",
        outfit: { pants: 12, skis: 1.5, helmet: "red" },
        sound: "loud",
      },
    };
    expect(parseSave(JSON.stringify(broken)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("reads a version 2 save written before the scenery setting existed", () => {
    const older = { schemaVersion: 2, records: {}, settings: { leanControl: "tilt", vibration: false } };
    expect(parseSave(JSON.stringify(older)).settings).toEqual({
      ...DEFAULT_SETTINGS,
      leanControl: "tilt",
      vibration: false,
    });
  });
});

describe("save store", () => {
  it("round-trips through a backend", async () => {
    const backend = memoryBackend();
    const save = withJump(emptySave(), "own-1", { distanceM: 70, points: 60, fell: false }, NOW);
    await saveSave(backend, save);
    expect(await loadSave(backend)).toEqual(save);
  });

  it("prefers host storage, then localStorage, then memory", async () => {
    const host = new Map<string, string>();
    const hostStore = {
      get: (k: string) => Promise.resolve(host.has(k) ? { key: k, value: host.get(k) } : null),
      set: (k: string, v: string) => {
        host.set(k, v);
        return Promise.resolve();
      },
    };
    const viaHost = detectBackend({ storage: hostStore });
    expect(viaHost.name).toBe("window.storage");
    await viaHost.set(SAVE_KEY, "{}");
    expect(await viaHost.get(SAVE_KEY)).toBe("{}");

    const items = new Map<string, string>();
    const local = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
    expect(detectBackend({ localStorage: local }).name).toBe("localStorage");

    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(detectBackend({ localStorage: broken }).name).toBe("memory");
  });
});
