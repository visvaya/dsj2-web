import type { HillChoice } from "../game/hill-choice";
import { LAYER_TABLE_LENGTH_M } from "../render/hill-layer-tables";
import { buildHillProfile } from "../sim/hill-setup";
import { hillGeometry } from "./hill-geometry";
import {
  bestTakeoffAim,
  EXACT_PLAYER_LEVEL,
  PLAYER_LEVELS,
  playJump,
  randomJump,
  type JumpOutcome,
} from "./hill-players";
import type { HillProblem, HillSpec } from "./hill-spec";

/** Thresholds of the simulation checks: what makes a hill play well and fairly, measured with the bots. */
export const PLAY_RULES = {
  /** The simple flight steering of the bots is credible up to about this size; above it the bot, not the hill, decides. */
  botReliableMaxKPointM: 120,
  /** Takeoff aims within this distance of the best one count as hitting the takeoff. */
  windowToleranceM: 3,
  /** No hill may require one exact frame of timing: at least this many aim frames reach the best distance. */
  windowMinFrames: 2,
  /** The good player's median lands near the K point: not far short of it, not far past it. */
  goodMedianFromKMinM: -20,
  goodMedianFromKMaxM: 10,
  /** Skill must win: the good player beats the average one on at least this share of the same jumps. */
  goodBeatsAverageMinShare: 0.7,
  /** A hill that throws practised players is unfair: falls (and disqualifications) of average and good players. */
  fallRateMaxShare: 0.05,
  /**
   * The best jump, as the median over the wind seeds, reaches near the K point; less means the hill cannot be
   * jumped to its size. The median and not the worst seed: one strong head wind must not fail a fair hill.
   */
  bestFromKMinM: -10,
  /**
   * The best jump on any wind seed stays within the landing area plus this much: no skilled player sails past
   * it, even with the most helpful wind of the sample.
   */
  bestPastLandingAreaMaxM: 5,
  /** A real flight: the good player's median time in the air. */
  goodMedianFlightMinS: 2.5,
  /** Ski jumpers fly close to the slope; a 90th percentile higher than this means the profile throws them up. */
  highestAboveTerrainP90MaxM: 8,
  /** Speed at the takeoff of every bot jump, within what a ski jump hill gives. */
  takeoffSpeedMinKmPerH: 50,
  takeoffSpeedMaxKmPerH: 120,
  /**
   * Wind may move a jump, but by less than skill does: deviation of the good player's distance at a fixed aim, as
   * a share of the K point, because the same wind carries a jumper further in a longer flight (5.5% measured on
   * the training hill).
   */
  windSpreadMaxShareOfK: 0.08,
  /** The scenery ends here; a random jump must stop before it. */
  finalXMaxM: LAYER_TABLE_LENGTH_M,
  /**
   * How deep the jumper's point may go below the terrain in a random jump. Measured 0 m on the training hill over
   * 316 random jumps; 0.5 m leaves room for rounding on another profile while still catching a jumper who falls
   * through the slope.
   */
  belowTerrainMaxM: 0.5,
} as const;

/** How many jumps the checks run, per hill. */
const PLAY_SAMPLE = {
  /** Jump seeds (wind) each player level jumps once on, paired between the levels. */
  playerSeeds: 32,
  /** Jump seeds of the takeoff aim sweep (41 jumps each). */
  sweepSeeds: 4,
  /** Jumps with random inputs. */
  randomJumps: 16,
} as const;

/** Seeds of the player's own errors are offset from the jump seeds, so the two do not repeat each other. */
const NOISE_SEED_OFFSET = 1000;

/** Plain numbers measured on a hill by the bots; no threshold is applied here. */
export interface PlayMeasures {
  /** Smallest takeoff window over the sweep seeds, in aim frames. */
  windowMinFrames: number;
  /** Median and largest best distance of the sweep over its seeds. */
  bestMedianM: number;
  bestMaxM: number;
  medianWeakM: number;
  medianAverageM: number;
  medianGoodM: number;
  /** Share of paired jumps on which the good player went further than the average one. */
  goodBeatsAverageShare: number;
  fallRateAverage: number;
  fallRateGood: number;
  medianGoodFlightS: number;
  /** 90th percentile over all player jumps. */
  highestAboveTerrainP90M: number;
  takeoffSpeedMinKmPerH: number;
  takeoffSpeedMaxKmPerH: number;
  /** Standard deviation of an exact good player's distance at one fixed aim over the jump seeds. */
  windSpreadM: number;
  randomAllEnded: boolean;
  randomAllFinite: boolean;
  randomFinalXMaxM: number;
  randomBelowTerrainMaxM: number;
}

export interface PlaySample {
  playerSeeds: number;
  sweepSeeds: number;
  randomJumps: number;
}

const seedsOf = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);

function quantile(values: readonly number[], q: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (at - lo);
}

const median = (values: readonly number[]): number => quantile(values, 0.5);

function deviation(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length);
}

const failed = (o: JumpOutcome): boolean => o.fell || o.disqualified;
const share = (outcomes: readonly JumpOutcome[], test: (o: JumpOutcome) => boolean): number =>
  outcomes.filter(test).length / outcomes.length;
const distances = (outcomes: readonly JumpOutcome[]): number[] => outcomes.map((o) => o.distanceM);

/** Runs the bots on a hill and measures how it plays. */
export function playMeasures(hill: HillChoice, sample: PlaySample = PLAY_SAMPLE): PlayMeasures {
  const seeds = seedsOf(sample.playerSeeds);
  const sweep = bestTakeoffAim(hill, seedsOf(sample.sweepSeeds), PLAY_RULES.windowToleranceM);
  const aim = Math.round(median(sweep.map((s) => s.bestAimFrames)));
  const level = (player: (typeof PLAYER_LEVELS)[keyof typeof PLAYER_LEVELS]) =>
    seeds.map((seed) => playJump(hill, seed, player, seed + NOISE_SEED_OFFSET, aim));
  const weak = level(PLAYER_LEVELS.weak);
  const average = level(PLAYER_LEVELS.average);
  const good = level(PLAYER_LEVELS.good);
  const players = [...weak, ...average, ...good];
  const lifted = players.filter((o) => o.takeoffSpeedKmPerH > 0).map((o) => o.takeoffSpeedKmPerH);
  const windOnly = seeds.map((seed) => playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, aim));
  const random = seedsOf(sample.randomJumps).map((seed) => randomJump(hill, seed, seed + NOISE_SEED_OFFSET));
  return {
    windowMinFrames: Math.min(...sweep.map((s) => s.windowFrames)),
    bestMedianM: median(sweep.map((s) => s.bestDistanceM)),
    bestMaxM: Math.max(...sweep.map((s) => s.bestDistanceM)),
    medianWeakM: median(distances(weak)),
    medianAverageM: median(distances(average)),
    medianGoodM: median(distances(good)),
    goodBeatsAverageShare: good.filter((o, i) => o.distanceM > (average[i]?.distanceM ?? 0)).length / seeds.length,
    fallRateAverage: share(average, failed),
    fallRateGood: share(good, failed),
    medianGoodFlightS: median(good.map((o) => o.flightTimeS)),
    highestAboveTerrainP90M: quantile(
      players.map((o) => o.highestAboveTerrainM),
      0.9,
    ),
    takeoffSpeedMinKmPerH: Math.min(...lifted),
    takeoffSpeedMaxKmPerH: Math.max(...lifted),
    windSpreadM: deviation(distances(windOnly)),
    randomAllEnded: random.every((o) => o.ended),
    randomAllFinite: random.every((o) => o.finite),
    randomFinalXMaxM: Math.max(...random.map((o) => o.finalXM)),
    randomBelowTerrainMaxM: Math.max(...random.map((o) => o.deepestBelowTerrainM)),
  };
}

const problem = (rule: string, message: string): HillProblem => ({ rule: `play.${rule}`, path: "", message });
const outside = (v: number, lo: number, hi: number): boolean => !(v >= lo && v <= hi);

/** Problems of a hill by the simulation rules, from its measures; empty when the hill passes them all. */
export function playProblems(spec: HillSpec, m: PlayMeasures): readonly HillProblem[] {
  const r = PLAY_RULES;
  const k = spec.kPointM;
  if (k > r.botReliableMaxKPointM) {
    return [
      problem(
        "bot-unreliable",
        `K ${k} m is above ${r.botReliableMaxKPointM} m, where the bots' steering decides more than the hill; ` +
          "this hill cannot pass until a stronger bot exists",
      ),
    ];
  }
  const { landingAreaEndM } = hillGeometry(buildHillProfile(spec.profile.inrun, spec.profile.landing), k);
  const checks: readonly [boolean, string, string][] = [
    [!(m.windowMinFrames >= r.windowMinFrames), "takeoff-window", `takeoff window of ${m.windowMinFrames} frames`],
    [
      outside(m.medianGoodM - k, r.goodMedianFromKMinM, r.goodMedianFromKMaxM),
      "good-median",
      `good player's median ${m.medianGoodM} m on K ${k} m`,
    ],
    [
      !(m.medianWeakM < m.medianAverageM && m.medianAverageM < m.medianGoodM),
      "levels-ordered",
      `medians weak ${m.medianWeakM} m, average ${m.medianAverageM} m, good ${m.medianGoodM} m`,
    ],
    [
      !(m.goodBeatsAverageShare >= r.goodBeatsAverageMinShare),
      "skill-wins",
      `good beats average on ${m.goodBeatsAverageShare} of the jumps`,
    ],
    [
      !(m.fallRateAverage <= r.fallRateMaxShare && m.fallRateGood <= r.fallRateMaxShare),
      "fall-rate",
      `fall rates average ${m.fallRateAverage}, good ${m.fallRateGood}`,
    ],
    [!(m.bestMedianM >= k + r.bestFromKMinM), "best-short", `best distance only ${m.bestMedianM} m on K ${k} m`],
    [
      !(m.bestMaxM <= landingAreaEndM + r.bestPastLandingAreaMaxM),
      "best-past-landing-area",
      `best distance ${m.bestMaxM} m past the landing area ending at ${landingAreaEndM} m`,
    ],
    [!(m.medianGoodFlightS >= r.goodMedianFlightMinS), "flight-time", `median flight ${m.medianGoodFlightS} s`],
    [
      !(m.highestAboveTerrainP90M <= r.highestAboveTerrainP90MaxM),
      "flight-height",
      `90th percentile of the flight height ${m.highestAboveTerrainP90M} m`,
    ],
    [
      !(m.takeoffSpeedMinKmPerH >= r.takeoffSpeedMinKmPerH && m.takeoffSpeedMaxKmPerH <= r.takeoffSpeedMaxKmPerH),
      "takeoff-speed",
      `takeoff speed ${m.takeoffSpeedMinKmPerH}..${m.takeoffSpeedMaxKmPerH} km/h`,
    ],
    [
      !(m.windSpreadM <= r.windSpreadMaxShareOfK * k),
      "wind-spread",
      `wind moves the distance by ${m.windSpreadM} m on K ${k} m`,
    ],
    [!m.randomAllEnded, "random-ends", "a jump with random inputs did not end"],
    [!m.randomAllFinite, "random-finite", "a jump with random inputs produced a number that is not finite"],
    [!(m.randomFinalXMaxM <= r.finalXMaxM), "random-within-scene", `a random jump stopped at ${m.randomFinalXMaxM} m`],
    [
      !(m.randomBelowTerrainMaxM <= r.belowTerrainMaxM),
      "random-below-terrain",
      `a random jump went ${m.randomBelowTerrainMaxM} m below the terrain`,
    ],
  ];
  return checks.filter(([bad]) => bad).map(([, rule, message]) => problem(rule, message));
}
