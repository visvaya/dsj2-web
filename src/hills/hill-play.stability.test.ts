import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { PLAY_SAMPLE, playMeasures, playProblems } from "./hill-play";
import { OWN_HILL_SPECS } from "./own-hills";

/**
 * The slow tier of the hill checks, run by `pnpm test:hills-stability` (and in CI when the hills, the simulation
 * or the game change): a verdict taken from a sample must not depend on the sample. Three evaluations of about
 * 4 s each, several times longer under a loaded machine.
 */
const STABILITY_TIMEOUT_MS = 360_000;

describe("play rules on other seeds", () => {
  it.each(OWN_HILL_SPECS.map((s) => [s.id, s] as const))(
    "%s gets the same verdict on three disjoint seed sets",
    (id, spec) => {
      const hill = OWN_HILLS.find((h) => h.id === id);
      if (hill === undefined) throw new Error(`no hill ${id}`);
      const verdict = (set: number) => {
        const sample = {
          ...PLAY_SAMPLE,
          firstScanSeed: PLAY_SAMPLE.firstScanSeed + set * PLAY_SAMPLE.scanSeeds,
          firstRandomSeed: PLAY_SAMPLE.firstRandomSeed + set * PLAY_SAMPLE.randomJumps,
        };
        return playProblems(spec, playMeasures(hill, sample)).map((p) => p.rule);
      };
      const first = verdict(0);
      expect(verdict(1)).toEqual(first);
      expect(verdict(2)).toEqual(first);
    },
    STABILITY_TIMEOUT_MS,
  );
});
