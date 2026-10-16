import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { PLAY_RULES, PLAY_SAMPLE, playMeasures, playProblems, type PlayMeasures } from "./hill-play";
import type { HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";

/** The whole evaluation of one hill takes about 8 s alone and more under the full parallel suite. */
const EVALUATION_TIMEOUT_MS = 30_000;

const [training] = OWN_HILL_SPECS;
if (training === undefined) throw new Error("no own hill");

/** Measures that pass every rule on the training hill (K 90 m, landing area ending near 121 m). */
const passing: PlayMeasures = {
  windowMedianFrames: 3,
  windowAtLeastMinShare: 1,
  windowMinFrames: 3,
  bestMedianM: 84,
  bestMaxM: 94,
  medianWeakM: 63,
  medianAverageM: 77,
  medianGoodM: 84,
  goodBeatsAverageShare: 0.9,
  fallRateAverage: 0,
  fallRateGood: 0,
  medianGoodFlightS: 3.9,
  highestAboveTerrainP90M: 5,
  takeoffSpeedMinKmPerH: 69,
  takeoffSpeedMaxKmPerH: 72,
  windSpreadM: 5,
  randomAllEnded: true,
  randomAllFinite: true,
  randomFinalXMaxM: 190,
  randomBelowTerrainMaxM: 0,
};

const rulesOf = (spec: HillSpec, change: Partial<PlayMeasures>) =>
  playProblems(spec, { ...passing, ...change }).map((p) => p.rule);

describe("play rules", () => {
  it.each(OWN_HILL_SPECS.map((s) => [s.id, s] as const))(
    "%s plays well and fairly",
    (id, spec) => {
      const hill = OWN_HILLS.find((h) => h.id === id);
      if (hill === undefined) throw new Error(`no hill ${id}`);
      expect(playProblems(spec, playMeasures(hill))).toEqual([]);
    },
    EVALUATION_TIMEOUT_MS,
  );

  it("passes the hand-made measures", () => {
    expect(rulesOf(training, {})).toEqual([]);
  });

  it("tolerates a single 1-frame window and the bot's occasional fall", () => {
    expect(rulesOf(training, { windowMinFrames: 1, windowAtLeastMinShare: 0.9375, fallRateAverage: 0.1 })).toEqual([]);
  });

  it.each(OWN_HILL_SPECS.map((s) => [s.id, s] as const))(
    "%s gets the same verdict on other seeds, so the verdict on this hill does not depend on the seeds",
    (id, spec) => {
      const hill = OWN_HILLS.find((h) => h.id === id);
      if (hill === undefined) throw new Error(`no hill ${id}`);
      const verdict = (set: number) => {
        const sample = {
          ...PLAY_SAMPLE,
          firstPlayerSeed: 1 + set * PLAY_SAMPLE.playerSeeds,
          firstSweepSeed: 1 + set * PLAY_SAMPLE.sweepSeeds,
          firstRandomSeed: 1 + set * PLAY_SAMPLE.randomJumps,
        };
        return playProblems(spec, playMeasures(hill, sample)).map((p) => p.rule);
      };
      const first = verdict(0);
      expect(verdict(1)).toEqual(first);
      expect(verdict(2)).toEqual(first);
    },
    3 * EVALUATION_TIMEOUT_MS,
  );

  it.each<[string, Partial<PlayMeasures>]>([
    ["play.takeoff-window", { windowMedianFrames: 1.5 }],
    ["play.takeoff-window-share", { windowAtLeastMinShare: 0.7 }],
    ["play.takeoff-clean", { windowMinFrames: 0 }],
    ["play.good-median", { medianGoodM: 69, medianAverageM: 60, medianWeakM: 50 }],
    ["play.good-median", { medianGoodM: 101 }],
    ["play.levels-ordered", { medianAverageM: 85 }],
    ["play.levels-ordered", { medianWeakM: 77 }],
    ["play.skill-wins", { goodBeatsAverageShare: 0.6 }],
    ["play.fall-rate", { fallRateAverage: 0.11 }],
    ["play.fall-rate", { fallRateGood: 0.04 }],
    ["play.best-short", { bestMedianM: 79 }],
    ["play.best-past-landing-area", { bestMaxM: 127 }],
    ["play.flight-time", { medianGoodFlightS: 2.4 }],
    ["play.flight-height", { highestAboveTerrainP90M: 8.5 }],
    ["play.takeoff-speed", { takeoffSpeedMinKmPerH: 45 }],
    ["play.takeoff-speed", { takeoffSpeedMaxKmPerH: 125 }],
    ["play.wind-spread", { windSpreadM: 7.3 }],
    ["play.random-ends", { randomAllEnded: false }],
    ["play.random-finite", { randomAllFinite: false }],
    ["play.random-within-scene", { randomFinalXMaxM: 381 }],
    ["play.random-below-terrain", { randomBelowTerrainMaxM: 0.6 }],
  ])("reports %s", (rule, change) => {
    expect(rulesOf(training, change)).toEqual([rule]);
  });

  it("allows wind a spread in proportion to the hill's size", () => {
    const larger: HillSpec = { ...training, kPointM: PLAY_RULES.botReliableMaxKPointM };
    expect(rulesOf(training, { windSpreadM: 9 })).toEqual(["play.wind-spread"]);
    expect(rulesOf(larger, { windSpreadM: 9 }).filter((r) => r === "play.wind-spread")).toEqual([]);
  });

  it("does not judge a hill above the bots' reach", () => {
    const large: HillSpec = { ...training, kPointM: PLAY_RULES.botReliableMaxKPointM + 1 };
    expect(rulesOf(large, {})).toEqual(["play.bot-unreliable"]);
  });
});
