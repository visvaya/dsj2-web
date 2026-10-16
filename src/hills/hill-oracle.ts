import type { HillChoice } from "../game/hill-choice";
import { coordinateSearch, type AxisMove } from "./coordinate-search";
import { planJump, type BotPlan, type JumpOutcome } from "./hill-players";
import {
  LEAN_LIMITS_RAD,
  policyLandingHeightM,
  policyLeanRad,
  policyTakesOff,
  TRAINED_PLAYER_POLICY,
  type PlayerPolicy,
} from "./player-policy";

/**
 * The oracle: a planner that may look ahead. For one hill and one jump seed (so one wind, known in advance) it
 * searches the takeoff aim, a flight schedule and the landing moment for the most points. It answers how far a
 * hill can be jumped at best in a wind, and it is the reference the trained player is measured against.
 *
 * The search is a deterministic coordinate search around the trained player's jump: it shifts the aim by whole
 * frames, adds a lean to each part of the flight and shifts the landing height, keeping a change while the
 * points grow. It starts from the trained player's own jump, so the oracle never scores below it.
 */

const FRAME_S = 1 / 70;

/** A fall or a disqualification scores this, below any clean jump of a hill the format admits. */
export const FAILED_JUMP_SCORE_POINTS = -100;

/** What a jump is worth to a player: the game's points, or the failed score after a fall or a disqualification. */
export const jumpScore = (o: JumpOutcome): number => (o.fell || o.disqualified ? FAILED_JUMP_SCORE_POINTS : o.points);

/** How the oracle searches. */
export interface OracleSearch {
  partEndsFrames: readonly number[];
  aimStepFrames: number;
  leanStepsRad: readonly number[];
  landingStepsM: readonly number[];
  maxJumps: number;
}

export const ORACLE_SEARCH: OracleSearch = {
  /**
   * The flight schedule's parts end at these frames from the takeoff (the last part runs to the landing): the
   * first rise, the early flight, the middle and the end of a long flight.
   */
  partEndsFrames: [35, 105, 210],
  /** Step of the takeoff aim, in frames, at every scale. */
  aimStepFrames: 1,
  /** Steps of the leans and of the landing height, coarse first. */
  leanStepsRad: [0.1, 0.04],
  landingStepsM: [1, 0.4],
  /** The search stops after this many jumps of one seed. */
  maxJumps: 60,
};

/** A change of the trained player's jump: what the oracle searches. */
interface OracleChoice {
  aimShiftFrames: number;
  /** Lean added in each part of the flight, in radians. */
  leanShiftsRad: readonly number[];
  landingShiftM: number;
}

export interface OracleResult {
  choice: OracleChoice;
  outcome: JumpOutcome;
  score: number;
  /** Jumps the search ran. */
  jumps: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function partOf(framesSinceTakeoff: number, ends: readonly number[]): number {
  const i = ends.findIndex((end) => framesSinceTakeoff < end);
  return i === -1 ? ends.length : i;
}

function planOf(policy: PlayerPolicy, choice: OracleChoice, search: OracleSearch): BotPlan {
  return {
    takesOff: (view) => policyTakesOff(policy, view, choice.aimShiftFrames * FRAME_S),
    leanRad: (view) =>
      clamp(
        policyLeanRad(policy, view) +
          (choice.leanShiftsRad[partOf(view.framesSinceTakeoff ?? 0, search.partEndsFrames)] ?? 0),
        LEAN_LIMITS_RAD.min,
        LEAN_LIMITS_RAD.max,
      ),
    landingHeightM: (view) => policyLandingHeightM(policy, view) + choice.landingShiftM,
    landing: policy.telemark ? "telemark" : "two-footed",
  };
}

/** One coordinate of a choice: its value, a copy with a new value, and its steps by scale. */
interface Coordinate {
  get: (c: OracleChoice) => number;
  set: (c: OracleChoice, v: number) => OracleChoice;
  steps: readonly number[];
}

function coordinates(search: OracleSearch): Coordinate[] {
  const scales = search.leanStepsRad.length;
  const aim: Coordinate = {
    get: (c) => c.aimShiftFrames,
    set: (c, v) => ({ ...c, aimShiftFrames: v }),
    steps: Array.from({ length: scales }, () => search.aimStepFrames),
  };
  const leans = Array.from({ length: search.partEndsFrames.length + 1 }, (_, part): Coordinate => ({
    get: (c) => c.leanShiftsRad[part] ?? 0,
    set: (c, v) => ({ ...c, leanShiftsRad: c.leanShiftsRad.map((l, i) => (i === part ? v : l)) }),
    steps: search.leanStepsRad,
  }));
  const landing: Coordinate = {
    get: (c) => c.landingShiftM,
    set: (c, v) => ({ ...c, landingShiftM: v }),
    steps: search.landingStepsM,
  };
  return [aim, ...leans, landing];
}

/**
 * The best jump the oracle finds on `hill` with jump seed `seed`, starting from `policy`'s jump. At each scale of
 * steps it tries each coordinate one step up and down and keeps stepping the way that gains, until a full round
 * gains nothing or the jumps run out; a tie keeps the earlier choice.
 */
export function oracleJump(
  hill: HillChoice,
  seed: number,
  policy: PlayerPolicy = TRAINED_PLAYER_POLICY,
  search: OracleSearch = ORACLE_SEARCH,
): OracleResult {
  const tried = new Map<string, { outcome: JumpOutcome; score: number }>();
  const evaluate = (choice: OracleChoice) => {
    const key = JSON.stringify(choice);
    const known = tried.get(key);
    if (known !== undefined) return known;
    const outcome = planJump(hill, seed, planOf(policy, choice, search));
    const result = { outcome, score: jumpScore(outcome) };
    tried.set(key, result);
    return result;
  };
  const start: OracleChoice = {
    aimShiftFrames: 0,
    leanShiftsRad: Array.from({ length: search.partEndsFrames.length + 1 }, () => 0),
    landingShiftM: 0,
  };
  const score = (choice: OracleChoice): number | null => (tried.size < search.maxJumps ? evaluate(choice).score : null);
  const coords = coordinates(search);
  const best = search.leanStepsRad.reduce(
    (from, _, scale) =>
      coordinateSearch(
        from,
        coords.map(
          (coord): AxisMove<OracleChoice> =>
            (choice, direction) =>
              coord.set(choice, coord.get(choice) + direction * (coord.steps[scale] ?? 0)),
        ),
        score,
      ),
    { point: start, score: evaluate(start).score },
  );
  const outcome = evaluate(best.point).outcome;
  return { choice: best.point, outcome, score: best.score, jumps: tried.size };
}
