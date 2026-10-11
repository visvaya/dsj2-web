import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRACE_POINT, decodeHill, decodeKPoint, diffStates, gameFile, hillTraceFile, readTrace } from "../sim/test-support/dsj-trace";
import { ORIGINAL_HILL_COUNTRY } from "../game/hill-choice";
import { COUNTRY_NAME_PL } from "../render/flags";
import { readOriginalHills } from "./original-hills";

const exePath = gameFile("Dsj.exe");
const datPath = gameFile("Dsj.dat");
const tracePath = hillTraceFile();

function load() {
  const exe = new Uint8Array(readFileSync(exePath ?? ""));
  const dat = datPath === undefined ? undefined : new Uint8Array(readFileSync(datPath));
  return readOriginalHills(exe, dat);
}

describe.skipIf(exePath === undefined)("hills read from the original executable", () => {

  it("finds all 37 hills of v2.10P", () => {
    expect(load().map((h) => h.number)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
  });

  it.skipIf(datPath === undefined)("names the hills like the replay files", () => {
    expect(load().slice(32).map((h) => h.name)).toEqual(["Zakopane 1", "Zakopane 2", "Karpacz", "Wisła", "Szczyrk"]);
  });

  it.skipIf(datPath === undefined)("names hills 1-32 after the countries their flags show", () => {
    const names = load().slice(0, 32).map((h) => h.name);
    expect(names).toEqual(ORIGINAL_HILL_COUNTRY.slice(0, 32).map((code) => COUNTRY_NAME_PL[code]));
  });

  it.skipIf(tracePath === undefined)("matches the profile the original game sets up, bit for bit", () => {
    const hills = load();
    const snaps = readTrace(tracePath ?? "").filter((s) => s.point === TRACE_POINT.hillSetup);
    expect(snaps.length).toBe(37);
    const failures: string[] = [];
    for (const snap of snaps) {
      const hill = hills.find((h) => h.number === snap.frame);
      const bad = diffStates(
        { profile: hill?.profile, k: hill?.kPointM },
        { profile: decodeHill(snap.view), k: decodeKPoint(snap.view) },
        0,
        new Set(),
      );
      if (bad.length > 0) failures.push(`hill ${snap.frame}: ${bad.join("; ")}`);
    }
    expect(failures).toEqual([]);
  });
});
