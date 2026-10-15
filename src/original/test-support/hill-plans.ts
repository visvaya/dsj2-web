import { BorlandRandom } from "../../sim/borland-random";
import { ORIGINAL_POSES } from "../../sim/data/pose-table";
import type { JumpSetup } from "../../sim/jump-sim";
import type { ReplayPlan } from "../../storage/original-replay-file";
import { createStartWind } from "../../sim/training-wind";
import { readOriginalHills, type OriginalHill } from "../original-hills";
import { planJump, type JumpScript, type PlannedResult } from "./scripted-jump";

/**
 * Replay plans for the hills of the player's own copy of the original game: this project's simulation plays a
 * scripted jump on a hill read from Dsj.exe and the input becomes a plan (see scripted-jump.ts).
 * Used from the command line through scripts/plan-replays.mjs; nothing here is part of the game.
 */

export const HILL_PLAN = {
  /** The generator seed of hill n is SEED_BASE + n; the starting wind is drawn from it like in training. */
  SEED_BASE: 21_000,
  START_FRAME: 70,
  TAKEOFF_LEAD_S: 0.2,
  TAKEOFF_HOLD_FRAMES: 14,
  /** The landing button goes down this many frames before the expected touchdown. */
  LANDING_LEAD_FRAMES: 36,
  /** Frames after liftoff in which the mouse moves one mickey, leaning the jumper forward. */
  LEAN_FRAMES: 22,
} as const;

/** One plan as written to disk; tools/re/craft_replays.py reads `plan`. */
export interface PlanFile {
  /** Name of the replay to make from the plan: a DOS file name of at most 8 characters, without extension. */
  name: string;
  hill: { number: number; name: string | null; kPointM: number };
  /** The scripted input in words. */
  input: string;
  plan: ReplayPlan;
  /** What this project's simulation makes of the plan; the original game is expected to agree. */
  expected: PlannedResult;
}

/** What a plan needs to know about a hill. */
export type PlannedHill = Pick<OriginalHill, "number" | "name" | "kPointM" | "profile">;

/** The jump setup of a replay: seed and wind as the hill setup routine leaves them, both from one seed. */
export function hillSetup(hill: PlannedHill, seed: number): JumpSetup {
  const rng = new BorlandRandom(seed);
  const wind = createStartWind(rng);
  return {
    hill: hill.profile,
    kPointM: hill.kPointM,
    poses: ORIGINAL_POSES,
    wind,
    randomSeed: rng.seed,
    points: 0,
    presentation: true,
  };
}

/** An ordinary jump: both buttons shortly before the edge, a forward lean in the air, one landing button. */
export const ORDINARY_JUMP: JumpScript = {
  startFrame: HILL_PLAN.START_FRAME,
  takeoff: { leadS: HILL_PLAN.TAKEOFF_LEAD_S, buttons: 2, holdFrames: HILL_PLAN.TAKEOFF_HOLD_FRAMES },
  lean: (frame) => (frame < HILL_PLAN.LEAN_FRAMES ? 1 : 0),
  landing: { leadFrames: HILL_PLAN.LANDING_LEAD_FRAMES, delayFrames: 0, button: "right", otherButtonAfterFrames: null },
};

export function planFile(hill: PlannedHill, name: string, input: string, seed: number, script: JumpScript): PlanFile {
  const { plan, result } = planJump(hillSetup(hill, seed), hill.number, script);
  return { name, hill: { number: hill.number, name: hill.name, kPointM: hill.kPointM }, input, plan, expected: result };
}

/** Plans of an ordinary jump for the given hill numbers (all hills when the list is empty). */
export function planHills(exe: Uint8Array, dat: Uint8Array | undefined, numbers: readonly number[]): PlanFile[] {
  const hills = readOriginalHills(exe, dat);
  const unknown = numbers.filter((n) => !hills.some((hill) => hill.number === n));
  if (unknown.length > 0) {
    throw new RangeError(`no such hill: ${unknown.join(", ")} (the game has hills 1 to ${hills.length})`);
  }
  return hills
    .filter((hill) => numbers.length === 0 || numbers.includes(hill.number))
    .map((hill) =>
      planFile(
        hill,
        `HILL${String(hill.number).padStart(2, "0")}`,
        "ordinary jump",
        HILL_PLAN.SEED_BASE + hill.number,
        ORDINARY_JUMP,
      ),
    );
}

/** One line per plan: replay name, hill, K point and what the simulation expects. */
export function formatPlans(files: readonly PlanFile[]): string {
  const rows = files.map((file) => [
    file.name,
    String(file.hill.number),
    file.hill.name ?? "",
    `K${file.hill.kPointM}`,
    file.input,
    String(file.expected.frames),
    file.expected.distanceM.toFixed(2),
    String(file.expected.fallType),
  ]);
  const table = [["replay", "hill", "name", "K", "input", "frames", "distance", "fall"], ...rows];
  const widths = table[0]?.map((_, column) => Math.max(...table.map((row) => row[column]?.length ?? 0))) ?? [];
  return table
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}
