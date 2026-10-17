import { hillChoiceOf, type HillChoice } from "../../game/hill-choice";
import { BorlandRandom } from "../../sim/borland-random";
import { coordinateSearch, type AxisMove } from "../coordinate-search";
import { jumpScore } from "../hill-oracle";
import { NOISE_SEED_OFFSET, windClassSeeds } from "../hill-play";
import { EXACT_PLAYER_LEVEL, PLAYER_LEVELS, playJump } from "../hill-players";
import { OWN_HILL_SPECS } from "../own-hills";
import { REFERENCE_PLAYER_POLICY, type PlayerPolicy } from "../player-policy";
import { GENERATED_HILL_CHARACTERS, generatedHillSet, SET_HILLS_IN_GAME } from "./generated-hills";

/**
 * Training of the player policy: a deterministic coordinate search over its numbers for the most mean points of
 * the player without noise over a set of hills and winds: the generated set, hills of many sizes and shapes. Run by `node scripts/train-player.mjs`; the unit test only checks the recorded score.
 */

/** The training seeds. */
export const TRAINING_SET = {
  /** Jump seeds per wind class, picked as the gate picks them. */
  seedsPerClass: 2,
  scanSeeds: 256,
  firstScanSeed: 1,
} as const;

/** The training seeds: `seedsPerClass` of each wind class. */
export function trainingSeeds(set = TRAINING_SET): number[] {
  const seeds = windClassSeeds(set.firstScanSeed, set.scanSeeds, set.seedsPerClass);
  return Object.values(seeds).flat();
}

/**
 * The training hills: the generated set (`generated-hills.ts`), hills of many sizes and shapes. The play rules are
 * not run while generating it, because they judge a hill with the trained player, which the training replaces; the
 * tests run them on the set with the player in force.
 */
export function trainingHills(): HillChoice[] {
  return generatedHillSet(GENERATED_HILL_CHARACTERS, false).map((g) => hillChoiceOf(g.spec));
}

/** Mean score (points, a fall or a disqualification scoring the failed score) of `policy` over hills and seeds. */
export function trainingScore(policy: PlayerPolicy, hills: readonly HillChoice[], seeds: readonly number[]): number {
  const scores = hills.flatMap((hill) =>
    seeds.flatMap((seed) =>
      TRAINING_LEVELS.map(({ level, noise }) =>
        jumpScore(playJump(hill, seed, level, noise ? seed + NOISE_SEED_OFFSET : seed, policy)),
      ),
    ),
  );
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Who the score is taken for: the player without noise and the average and good levels with the same noise of
 * their own errors the play checks give them. A sensible player wants points despite their own errors, so a policy
 * that wins points only when every press is exact (a landing press low over the slope) loses them to the falls of
 * the noisy levels, which score the failed-jump score.
 */
const TRAINING_LEVELS = [
  { level: EXACT_PLAYER_LEVEL, noise: false },
  { level: PLAYER_LEVELS.average, noise: true },
  { level: PLAYER_LEVELS.good, noise: true },
] as const;

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

/**
 * Mean score over the game's own hills the training does not see (those not taken from the generated set),
 * unscaled, on the training seeds: what the unit test reproduces.
 */
export function ownHillsScore(policy: PlayerPolicy, set = TRAINING_SET): number {
  const fromSet = new Set(Object.values(SET_HILLS_IN_GAME));
  const unseen = OWN_HILL_SPECS.filter((spec) => !fromSet.has(spec.id));
  return trainingScore(policy, unseen.map(hillChoiceOf), trainingSeeds(set));
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
