import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { PLAY_RULES, PLAY_SAMPLE, playMeasures, playProblems } from "./hill-play";
import { generatedHillSet, SET_HILLS_IN_GAME } from "./test-support/generated-hills";
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
      // Every own hill within the bots' limit passes; larger ones wait for a bot that plays them reliably.
      expect(spec.kPointM > PLAY_RULES.botReliableMaxKPointM ? [] : first).toEqual([]);
      expect(verdict(1)).toEqual(first);
      expect(verdict(2)).toEqual(first);
    },
    STABILITY_TIMEOUT_MS,
  );
});

/** The whole generated set with the play rules on every hill up to the bots' limit: about two minutes alone. */
const GENERATED_SET_TIMEOUT_MS = 1_200_000;

describe("generated set", () => {
  it(
    "generates every hill of the set on target, with no problem by any rule and none too alike to another",
    () => {
      const set = generatedHillSet();
      const missed = set.flatMap(({ spec, report }) => [
        ...(report.bestOnTarget ? [] : [`${spec.id}: best calm jump ${report.bestCalmFromKM} m from K`]),
        ...report.styleProblems.map((p) => `${spec.id}: ${p.rule} (${p.message})`),
        ...(report.playJudged || spec.kPointM > PLAY_RULES.botReliableMaxKPointM ? [] : [`${spec.id}: not judged`]),
      ]);
      expect(missed).toEqual([]);
      // The hills of the set in the game are taken as the game has them, each once.
      const ownIds = set.map(({ spec }) => spec.id).filter((id) => OWN_HILL_SPECS.some((s) => s.id === id));
      expect(ownIds.toSorted()).toEqual(Object.values(SET_HILLS_IN_GAME).toSorted());
    },
    GENERATED_SET_TIMEOUT_MS,
  );
});
