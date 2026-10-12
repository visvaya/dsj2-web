import { planJump, type JumpScript, type PlannedJump } from "../../sim/test-support/replay-plan";
import { readOriginalHills } from "../original-hills";
import { HILL_PLAN, ORDINARY_JUMP, hillSetup, type PlanFile, type PlannedHill } from "./hill-plans";

/**
 * Searches this project's simulation for inputs that end in each kind of fall (JumpLogicState.fallType, 1 to 5),
 * over every hill of the player's copy of the original game and a grid of input patterns. The representative
 * case of each kind becomes a replay plan, so the original game can be recorded doing the same.
 * Used from the command line through scripts/search-falls.mjs; nothing here is part of the game.
 */

export const FALL_TYPES = [1, 2, 3, 4, 5] as const;

type Takeoff = JumpScript["takeoff"];
type Landing = JumpScript["landing"];

interface Named<T> {
  name: string;
  value: T;
}

const ORDINARY_TAKEOFF = {
  leadS: HILL_PLAN.TAKEOFF_LEAD_S,
  buttons: 2,
  holdFrames: HILL_PLAN.TAKEOFF_HOLD_FRAMES,
} as const;
const ORDINARY_LANDING = {
  leadFrames: HILL_PLAN.LANDING_LEAD_FRAMES,
  delayFrames: 0,
  button: "right",
  otherButtonAfterFrames: null,
} as const;

const TAKEOFFS: Named<Takeoff>[] = [
  { name: "takeoff on time", value: ORDINARY_TAKEOFF },
  { name: "takeoff early", value: { ...ORDINARY_TAKEOFF, leadS: 0.6 } },
  { name: "takeoff very early", value: { ...ORDINARY_TAKEOFF, leadS: 1.2 } },
  { name: "takeoff late", value: { ...ORDINARY_TAKEOFF, leadS: 0.04 } },
  { name: "takeoff past the edge", value: { ...ORDINARY_TAKEOFF, leadS: -0.1 } },
  { name: "takeoff with one button", value: { ...ORDINARY_TAKEOFF, buttons: 1 } },
  { name: "takeoff buttons held 20 frames", value: { ...ORDINARY_TAKEOFF, holdFrames: 20 } },
  { name: "no takeoff", value: null },
];

const LEANS: Named<JumpScript["lean"]>[] = [
  { name: "lean forward", value: ORDINARY_JUMP.lean },
  { name: "no lean", value: () => 0 },
  { name: "lean back", value: (frame) => (frame < 30 ? -1 : 0) },
  { name: "wild lean", value: (frame) => (Math.floor(frame / 10) % 2 === 0 ? 60 : -60) },
];

const LANDINGS: Named<Landing>[] = [
  { name: "landing on time", value: ORDINARY_LANDING },
  { name: "no landing press", value: null },
  { name: "landing right after takeoff", value: { ...ORDINARY_LANDING, leadFrames: 1_000_000 } },
  { name: "landing early", value: { ...ORDINARY_LANDING, leadFrames: 90 } },
  { name: "landing late", value: { ...ORDINARY_LANDING, leadFrames: 14 } },
  { name: "landing very late", value: { ...ORDINARY_LANDING, leadFrames: 5 } },
  { name: "landing after touchdown", value: { ...ORDINARY_LANDING, leadFrames: 1, delayFrames: 8 } },
  { name: "telemark", value: { ...ORDINARY_LANDING, otherButtonAfterFrames: 6 } },
];

export interface InputPattern {
  name: string;
  script: JumpScript;
}

/** Every combination of a takeoff, a lean and a landing, plus a jumper that never leaves the gate. */
export function inputPatterns(): InputPattern[] {
  const combined = TAKEOFFS.flatMap((takeoff) =>
    LEANS.flatMap((lean) =>
      LANDINGS.map((landing) => ({
        name: `${takeoff.name}, ${lean.name}, ${landing.name}`,
        script: { startFrame: HILL_PLAN.START_FRAME, takeoff: takeoff.value, lean: lean.value, landing: landing.value },
      })),
    ),
  );
  return [...combined, { name: "no input at all", script: { ...ORDINARY_JUMP, startFrame: null } }];
}

export interface FallSummary {
  fallType: number;
  /** Jumps that ended this way, the hills they were on and the patterns that produced them. */
  jumps: number;
  hills: number;
  patterns: number;
  /** How many of the jumps got past the takeoff edge (a jump that comes down on the inrun measures 0 m). */
  pastEdge: number;
  /** The first case past the edge, or else the first case: lowest hill number, then pattern order. */
  example: PlanFile | null;
}

export interface FallSearch {
  jumps: number;
  /** Jumps whose input a replay cannot hold. */
  unplannable: number;
  /** Fall type 0 (no fall) first, then 1 to 5. */
  summaries: FallSummary[];
}

function tryPlan(hill: PlannedHill, script: JumpScript): PlannedJump | null {
  try {
    return planJump(hillSetup(hill, HILL_PLAN.SEED_BASE + hill.number), hill.number, script);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

interface Found {
  hill: PlannedHill;
  pattern: string;
  jump: PlannedJump;
}

function summarise(fallType: number, found: readonly Found[]): FallSummary {
  const cases = found.filter((one) => one.jump.result.fallType === fallType);
  const pastEdge = cases.filter((one) => one.jump.result.distanceM > 0);
  const first = pastEdge[0] ?? cases[0];
  return {
    fallType,
    jumps: cases.length,
    hills: new Set(cases.map((one) => one.hill.number)).size,
    patterns: new Set(cases.map((one) => one.pattern)).size,
    pastEdge: pastEdge.length,
    example:
      first === undefined || fallType === 0
        ? null
        : {
            name: `FALL${fallType}`,
            hill: { number: first.hill.number, name: first.hill.name, kPointM: first.hill.kPointM },
            input: first.pattern,
            plan: first.jump.plan,
            expected: first.jump.result,
          },
  };
}

/** Plays every pattern on every given hill and sorts the endings by fall type. */
export function searchFalls(hills: readonly PlannedHill[], patterns: readonly InputPattern[]): FallSearch {
  const tried = hills.flatMap((hill) =>
    patterns.map((pattern) => ({ hill, pattern: pattern.name, jump: tryPlan(hill, pattern.script) })),
  );
  const found = tried.flatMap((one) => (one.jump === null ? [] : [{ ...one, jump: one.jump }]));
  return {
    jumps: tried.length,
    unplannable: tried.length - found.length,
    summaries: [0, ...FALL_TYPES].map((fallType) => summarise(fallType, found)),
  };
}

/** The search over all hills of the player's Dsj.exe with the built-in patterns. */
export function searchOriginalFalls(exe: Uint8Array, dat: Uint8Array | undefined): FallSearch {
  return searchFalls(readOriginalHills(exe, dat), inputPatterns());
}

/** One line per fall type: how often it was reached and the representative case. */
export function formatFallSearch(search: FallSearch): string {
  const lines = search.summaries.map((summary) => {
    const counts = `${summary.jumps} jumps (${summary.pastEdge} past the edge) on ${summary.hills} hills, ${summary.patterns} patterns`;
    const kind = summary.fallType === 0 ? "no fall" : `fall type ${summary.fallType}`;
    if (summary.jumps === 0) return `${kind}: not reached`;
    const { example } = summary;
    if (example === null) return `${kind}: ${counts}`;
    const where = `hill ${example.hill.number} (${example.hill.name ?? "unnamed"}, K${example.hill.kPointM})`;
    return `${kind}: ${counts}; ${example.name}: ${where}, ${example.input}, ${example.expected.distanceM.toFixed(2)} m`;
  });
  return [`${search.jumps} jumps, ${search.unplannable} with input a replay cannot hold`, ...lines].join("\n");
}
