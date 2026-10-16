import { hillChoiceOf, type HillChoice } from "../../game/hill-choice";
import { BorlandRandom } from "../../sim/borland-random";
import { buildHillProfile } from "../../sim/hill-setup";
import { coordinateSearch, type AxisMove } from "../coordinate-search";
import { admissionProblems, hillGeometry } from "../hill-geometry";
import { jumpScore } from "../hill-oracle";
import { windClassSeeds } from "../hill-play";
import { EXACT_PLAYER_LEVEL, playJump } from "../hill-players";
import type { HillSpec } from "../hill-spec";
import { OWN_HILL_SPECS } from "../own-hills";
import { parseHillSpec } from "../parse-hill-spec";
import type { PlayerPolicy } from "../player-policy";

/**
 * Training of the player policy: a deterministic coordinate search over its numbers for the most mean points of
 * the player without noise over a set of hills and winds. Only the game's own hills and variants made from their
 * data go into the set. Run by `node scripts/train-player.mjs`; the unit test only checks the recorded score.
 */

/** How the training set is made from each own hill. */
export const TRAINING_SET = {
  /** Every length of the hill (inrun and landing hill, K point with them) is multiplied by each of these. */
  sizeScales: [0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1, 2.5],
  /** Inruns made longer (negative) or shorter by these many metres, times the scale (`scaledHill`). */
  inrunShiftsM: [-32, -24, -16, -8, -4, 0, 4],
  /**
   * A variant is kept when the reference player's median distance over the training seeds lies between this share
   * of its K point and the end of its landing area: a hill that jumps to its size, as the play rules want. The
   * others (every jump far short, or past the landing area into a fall) teach a player nothing about a hill
   * anyone would build.
   */
  referenceMedianMinShareOfK: 0.75,
  /** Jump seeds per wind class, picked as the gate picks them. */
  seedsPerClass: 2,
  scanSeeds: 256,
  firstScanSeed: 1,
} as const;

/**
 * An own hill with every length multiplied by `scale` and its inrun made longer (negative `inrunShiftM`) or shorter
 * (positive) by that many metres of the original, times the scale. A shorter inrun starts further right; a longer
 * one keeps its start and moves the rest of the hill right, because the start cannot go below 0 m. The table keeps
 * its height (the landing hill is raised by what scaling would add to it), because the geometry rules hold it to a
 * range that does not grow with the hill.
 */
export function scaledHill(spec: HillSpec, scale: number, inrunShiftM: number): HillSpec {
  const { inrun, landing } = spec.profile;
  const startShiftM = Math.max(0, inrunShiftM) * scale;
  const restShiftM = Math.max(0, -inrunShiftM) * scale;
  const { tableHeightM } = hillGeometry(buildHillProfile(inrun, landing), spec.kPointM);
  return {
    ...spec,
    id: `${spec.id}-x${Math.round(scale * 100)}-i${inrunShiftM < 0 ? "m" : "p"}${Math.abs(inrunShiftM)}`,
    kPointM: Math.round(spec.kPointM * scale),
    profile: {
      inrun: {
        startXM: inrun.startXM * scale + startShiftM,
        flatEndXM: inrun.flatEndXM * scale + startShiftM,
        lineEndXM: inrun.lineEndXM * scale + restShiftM,
        takeoffXM: inrun.takeoffXM * scale + restShiftM,
        lineSlope: inrun.lineSlope,
        // The line keeps its heights where it moved to: y = slope x + intercept, shifted right.
        lineInterceptM: inrun.lineInterceptM * scale - inrun.lineSlope * restShiftM,
        curveA: inrun.curveA / scale,
      },
      landing: {
        centerXM: landing.centerXM * scale + restShiftM,
        centerYM: landing.centerYM * scale + tableHeightM * (scale - 1),
        amplitudeM: landing.amplitudeM * scale,
        widthM: landing.widthM * scale,
        outrunStartXM: landing.outrunStartXM * scale + restShiftM,
        outrunCurveA: landing.outrunCurveA / scale,
        knollBlend: landing.knollBlend,
      },
    },
  };
}

/** Whether a variant would be admitted: it reads as hill data and passes every admission rule of the geometry. */
const admitted = (spec: HillSpec): boolean => parseHillSpec(spec).ok && admissionProblems(spec).length === 0;

/** The training seeds: `seedsPerClass` of each wind class. */
export function trainingSeeds(set = TRAINING_SET): number[] {
  const seeds = windClassSeeds(set.firstScanSeed, set.scanSeeds, set.seedsPerClass);
  return Object.values(seeds).flat();
}

/**
 * The player the training set is chosen with, fixed so the set does not move with the trained numbers: the
 * scripted bot the play checks used before the policy was trained (aim 14 frames before the edge, one lean of
 * 0.3 rad, landing press at 2.2 m, telemark).
 */
export const REFERENCE_PLAYER_POLICY: PlayerPolicy = {
  takeoffAimS: 14 / 70,
  earlyFlightFrames: 0,
  earlyLeanRad: 0.3,
  leanRad: 0.3,
  leanPerSpeedRadPerMPerS: 0,
  leanPerHeightRadPerM: 0,
  leanPerTailWindRadPerMPerS: 0,
  landingHeightM: 2.2,
  landingPerClosingS: 0,
  telemark: true,
};

function jumpsToItsSize(spec: HillSpec, seeds: readonly number[], set: typeof TRAINING_SET): boolean {
  const hill = hillChoiceOf(spec);
  const { landingAreaEndM } = hillGeometry(hill.profile, spec.kPointM);
  const sorted = seeds
    .map((seed) => playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, REFERENCE_PLAYER_POLICY).distanceM)
    .toSorted((a, b) => a - b);
  const median =
    ((sorted[Math.floor((sorted.length - 1) / 2)] ?? 0) + (sorted[Math.ceil((sorted.length - 1) / 2)] ?? 0)) / 2;
  return median >= set.referenceMedianMinShareOfK * spec.kPointM && median <= landingAreaEndM;
}

/** The training hills: every admitted variant of every own hill (the hill itself among them) that jumps to its size. */
export function trainingHills(set = TRAINING_SET): HillChoice[] {
  const seeds = trainingSeeds(set);
  return OWN_HILL_SPECS.flatMap((spec) =>
    set.sizeScales.flatMap((scale) =>
      set.inrunShiftsM
        .map((shift) => scaledHill(spec, scale, shift))
        .filter((v) => admitted(v) && jumpsToItsSize(v, seeds, set)),
    ),
  ).map(hillChoiceOf);
}

/** Mean score (points, a fall or a disqualification scoring the failed score) of `policy` over hills and seeds. */
export function trainingScore(policy: PlayerPolicy, hills: readonly HillChoice[], seeds: readonly number[]): number {
  const scores = hills.flatMap((hill) =>
    seeds.map((seed) => jumpScore(playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, policy))),
  );
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** The numbers of a policy the training moves, with their steps (coarse first) and limits. */
type NumericKey = Exclude<keyof PlayerPolicy, "telemark">;

interface Axis {
  key: NumericKey;
  steps: readonly number[];
  min: number;
  max: number;
}

export const TRAINING_AXES: readonly Axis[] = [
  { key: "takeoffAimS", steps: [2 / 70, 1 / 70], min: -0.1, max: 0.5 },
  { key: "earlyFlightFrames", steps: [20, 10], min: 0, max: 200 },
  { key: "earlyLeanRad", steps: [0.1, 0.04], min: -0.2, max: 0.9 },
  { key: "leanRad", steps: [0.1, 0.04], min: -0.2, max: 0.9 },
  { key: "leanPerSpeedRadPerMPerS", steps: [0.02, 0.008], min: -0.2, max: 0.2 },
  { key: "leanPerHeightRadPerM", steps: [0.04, 0.016], min: -0.3, max: 0.3 },
  { key: "leanPerTailWindRadPerMPerS", steps: [0.04, 0.016], min: -0.3, max: 0.3 },
  { key: "landingHeightM", steps: [0.5, 0.2], min: 0, max: 6 },
  { key: "landingPerClosingS", steps: [0.1, 0.04], min: 0, max: 1 },
];

/** Steps are kept on a grid of this many decimals, so the trained numbers are short and reproducible. */
const STEP_DECIMALS = 6;
const onGrid = (v: number): number => Number(v.toFixed(STEP_DECIMALS));

export interface TrainingResult {
  policy: PlayerPolicy;
  score: number;
  /** Policies scored. */
  evaluations: number;
}

/** How the training searches. */
export const TRAINING_SEARCH = {
  /** Share of the evaluations spent on the evolution strategy; the rest polishes with a coordinate search. */
  evolutionShare: 0.7,
  /** Candidates drawn around the best policy in each round of the evolution strategy. */
  candidatesPerRound: 6,
  /** Spread of a draw, in coarse steps of each number: at the start, at least, and its change after a round. */
  spreadStartSteps: 1,
  spreadMinSteps: 0.25,
  spreadGrowth: 1.4,
  spreadShrink: 0.75,
  /** Seed of the evolution strategy's generator. */
  seed: 2026,
} as const;

/** Approximately normal draws with mean 0 and deviation 1, from additions only (sum of twelve uniforms). */
function normalFrom(rng: BorlandRandom): () => number {
  const resolution = 0x8000;
  return () => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += rng.below(resolution) / resolution;
    return sum - 6;
  };
}

/** A value of an axis on the grid of its finest step and within its limits. */
function snapped(axis: Axis, value: number): number {
  const fine = axis.steps.at(-1) ?? 1;
  return onGrid(Math.max(axis.min, Math.min(axis.max, Math.round(value / fine) * fine)));
}

/**
 * Trains a policy from `start`. First a (1+λ) evolution strategy with a seeded generator: each round draws
 * candidates around the best policy, every number moved by a normal draw scaled by its coarse step and the spread,
 * keeps the best candidate if it gains, and widens the spread after a gain and narrows it otherwise; moving all
 * numbers at once finds changes that only pay together (a lower landing press with a faster one when coming down
 * fast). Then a coordinate search with the fine steps: each number moved one step up and down and kept moving the
 * way that gains, until a round gains nothing or the evaluations run out. A tie keeps the earlier policy.
 * `onProgress` gets each improvement.
 *
 * The landing style is not trained: the start's telemark stays. Every training hill is a variant of one landing
 * hill shape, and a single comparison of the two styles on it is decided by a few seeds (one run picked two-footed
 * by 0.2 points over 152 jumps), while the reference player landing two-footed on the same set falls so often that
 * its mean drops from 128 to 82 points.
 */
export function trainPolicy(
  start: PlayerPolicy,
  hills: readonly HillChoice[],
  seeds: readonly number[],
  maxEvaluations: number,
  onProgress: (result: TrainingResult) => void = () => undefined,
  search = TRAINING_SEARCH,
): TrainingResult {
  let evaluations = 0;
  const score = (p: PlayerPolicy): number => {
    evaluations++;
    return trainingScore(p, hills, seeds);
  };
  let best = { policy: start, score: score(start) };
  const take = (policy: PlayerPolicy, s: number): void => {
    best = { policy, score: s };
    onProgress({ ...best, evaluations });
  };
  const normal = normalFrom(new BorlandRandom(search.seed));
  let spread: number = search.spreadStartSteps;
  const rounds = Math.floor((Math.floor(maxEvaluations * search.evolutionShare) - 1) / search.candidatesPerRound);
  for (let r = 0; r < rounds; r++) {
    const from = best;
    const candidates = Array.from({ length: search.candidatesPerRound }, (): PlayerPolicy => ({
      ...from.policy,
      ...Object.fromEntries(
        TRAINING_AXES.map((axis) => [
          axis.key,
          snapped(axis, from.policy[axis.key] + normal() * spread * (axis.steps[0] ?? 0)),
        ]),
      ),
    }));
    const scored = candidates.map((policy) => ({ policy, score: score(policy) }));
    const top = scored.reduce((b, c) => (c.score > b.score ? c : b));
    if (top.score > from.score) {
      take(top.policy, top.score);
      spread *= search.spreadGrowth;
    } else {
      spread = Math.max(search.spreadMinSteps, spread * search.spreadShrink);
    }
  }
  const moves = TRAINING_AXES.map((axis): AxisMove<PlayerPolicy> => (policy, direction) => {
    const value = onGrid(policy[axis.key] + direction * (axis.steps.at(-1) ?? 0));
    return value < axis.min || value > axis.max ? null : { ...policy, [axis.key]: value };
  });
  const polished = coordinateSearch(
    { point: best.policy, score: best.score },
    moves,
    (policy) => (evaluations < maxEvaluations ? score(policy) : null),
    (s) => take(s.point, s.score),
  );
  return { policy: polished.point, score: polished.score, evaluations };
}

/** Mean score over the game's own hills alone (unscaled), on the training seeds: what the unit test reproduces. */
export function ownHillsScore(policy: PlayerPolicy, set = TRAINING_SET): number {
  return trainingScore(policy, OWN_HILL_SPECS.map(hillChoiceOf), trainingSeeds(set));
}

/** Trains the policy from the reference player and reports as it goes; what `scripts/train-player.mjs` runs. */
export function runTraining(maxEvaluations: number, report: (line: string) => void): TrainingResult {
  const hills = trainingHills();
  const seeds = trainingSeeds();
  report(`training hills (${hills.length}): ${hills.map((h) => `${h.id} K${h.kPointM}`).join(", ")}`);
  report(`seeds: ${seeds.join(", ")}`);
  report(`reference score: ${trainingScore(REFERENCE_PLAYER_POLICY, hills, seeds)}`);
  const result = trainPolicy(REFERENCE_PLAYER_POLICY, hills, seeds, maxEvaluations, (r) =>
    report(`${r.evaluations}: ${r.score} ${JSON.stringify(r.policy)}`),
  );
  report(`trained score: ${result.score} after ${result.evaluations} evaluations`);
  report(`own hills score: ${ownHillsScore(result.policy)}`);
  report(`policy: ${JSON.stringify(result.policy, null, 2)}`);
  return result;
}
