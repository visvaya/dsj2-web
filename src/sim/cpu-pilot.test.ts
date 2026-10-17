import { describe, expect, it } from "vitest";
import { BorlandRandom } from "./borland-random";
import { cpuJumpRunning, stepCpuFrame, type CpuJumpState } from "./cpu-jump";
import {
  CPU_LEVEL_COUNT,
  cpuPilotInput,
  drawCpuForm,
  drawCpuTalents,
  setupCpuPilot,
  type CpuJumperRecord,
  type CpuPilotState,
  type CpuPilotView,
} from "./cpu-pilot";
import { ORIGINAL_POSES } from "./data/pose-table";
import { landingYM } from "./hill-profile";
import { PHASE } from "./jump-logic";
import { createJump, jumpRunning, type JumpSetup } from "./jump-sim";
import { FRAME_DT_S, f32 } from "./physics-constants";
import { calmWind, stateHash, syntheticHill } from "./test-support/synthetic";

const hill = syntheticHill();
const K_POINT_M = 90;
const AVERAGE: CpuJumperRecord = { form1: 0, form2: 0, talent1: 0, talent2: 0, level: 2 };
const SEED_SEARCH_LIMIT = 200_000;

/** The first seed (from a fixed sequence) whose setup satisfies `wanted`. */
function seedWhere(record: CpuJumperRecord, wanted: (p: CpuPilotState) => boolean): number {
  for (let i = 1; i < SEED_SEARCH_LIMIT; i++) {
    const seed = Math.imul(i, 0x9e3779b1) >>> 0;
    if (wanted(setupCpuPilot(record, K_POINT_M, hill, new BorlandRandom(seed)))) return seed;
  }
  throw new Error("no seed found");
}

const pilotOf = (record: CpuJumperRecord, seed: number) =>
  setupCpuPilot(record, K_POINT_M, hill, new BorlandRandom(seed));

/** A view of the jump at the entry of read_input, flying at `heightM` over the landing hill. */
function flightView(over: Partial<CpuPilotView> & { heightM?: number }): CpuPilotView {
  const xM = over.xM ?? 90;
  return {
    frame: 400,
    phase: PHASE.flight,
    xM,
    yM: landingYM(hill, xM) + (over.heightM ?? 10),
    vxMPerS: 24,
    vyMPerS: 4,
    speedMPerS: 24.3,
    slopeAngleRad: 0,
    bodyAngleRad: -0.3,
    landingPrepS: 0,
    randomSeed: 12345,
    ...over,
  };
}

const run = (pilot: CpuPilotState, view: CpuPilotView) =>
  cpuPilotInput(pilot, view, hill, FRAME_DT_S, new BorlandRandom(view.randomSeed));

describe("setup of a computer jumper (0baf:8aeb)", () => {
  it("depends only on the record, the K point and the seed, and stores Singles", () => {
    const a = pilotOf(AVERAGE, 777);
    expect(pilotOf(AVERAGE, 777)).toEqual(a);
    const numbers = Object.values(a).filter((value) => typeof value === "number");
    expect(numbers.map(f32)).toEqual(numbers);
    expect(a.reactionLeftS).toBe(a.reactionS);
    expect(a.impactPending).toBe(true);
  });

  it("advances the generator by the draws of the jump", () => {
    const rng = new BorlandRandom(777);
    setupCpuPilot(AVERAGE, K_POINT_M, hill, rng);
    expect(rng.seed).not.toBe(777);
  });

  it("keeps the second takeoff button no earlier than the first and the telemark delay within 0..0.42 s", () => {
    for (let seed = 1; seed < 300; seed++) {
      const p = pilotOf({ ...AVERAGE, level: seed % CPU_LEVEL_COUNT }, seed);
      expect(p.secondLeadS).toBeGreaterThanOrEqual(p.takeoffLeadS);
      const telemarkS = p.blunder ? 0 : p.telemarkDelayS;
      expect(telemarkS).toBeGreaterThanOrEqual(0);
      expect(telemarkS).toBeLessThanOrEqual(f32(0.42));
      expect(p.flightHoldS).toBeGreaterThanOrEqual(f32(0.05));
      expect(p.reactionS).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("replaces a takeoff lead below 0.108 s by an early one and above 0.252 s by a late one", () => {
    const weak = { ...AVERAGE, talent1: -3, form1: -1 };
    const low = pilotOf(weak, 1);
    expect(low.takeoffLeadS).toBeLessThanOrEqual(f32(0.65 * 0.18));
    expect(low.takeoffLeadS).toBeGreaterThan(f32(0.5 * 0.18));
    const strong = { ...AVERAGE, talent1: 3, form1: 1 };
    const high = pilotOf(strong, 1);
    expect(high.takeoffLeadS).toBeGreaterThanOrEqual(f32(1.35 * 0.18));
    expect(high.takeoffLeadS).toBeLessThan(f32(1.5 * 0.18));
  });

  it("blunders 1 in 40 jumps, with a late telemark or an early landing", () => {
    const late = pilotOf(
      AVERAGE,
      seedWhere(AVERAGE, (p) => p.blunder && p.telemarkDelayS > f32(0.42)),
    );
    expect(late.telemarkDelayS).toBeGreaterThanOrEqual(0.5);
    expect(late.landingLeadS).toBeGreaterThan(0.7);
    const early = pilotOf(
      AVERAGE,
      seedWhere(AVERAGE, (p) => p.blunder && p.telemarkDelayS <= f32(0.42)),
    );
    expect(Math.abs(early.landingLeadS)).toBeLessThanOrEqual(0.3);
    let blunders = 0;
    for (let seed = 1; seed <= 4000; seed++) if (pilotOf(AVERAGE, seed).blunder) blunders++;
    expect(blunders).toBeGreaterThan(50);
    expect(blunders).toBeLessThan(150);
  });

  it("aims the body angle lower for a weaker second talent", () => {
    expect(pilotOf({ ...AVERAGE, talent2: -2 }, 5).targetBodyRad).toBeLessThan(
      pilotOf({ ...AVERAGE, talent2: 2 }, 5).targetBodyRad,
    );
  });
});

describe("pilot of a computer jumper (0baf:8ee4)", () => {
  const pilot = pilotOf(AVERAGE, 777);

  it("opens the gate in frame 70 and does nothing else on the start", () => {
    const gate = { ...flightView({}), phase: PHASE.gate };
    expect(run(pilot, { ...gate, frame: 70 }).input).toEqual({ left: true, right: false, dy: 0 });
    expect(run(pilot, { ...gate, frame: 71 }).input).toEqual({ left: false, right: false, dy: 0 });
  });

  it("presses the takeoff buttons by the time left to the edge", () => {
    const at = (toEdgeS: number) =>
      run(pilot, {
        ...flightView({}),
        phase: PHASE.crouch,
        xM: hill.takeoffXM - toEdgeS * 20,
        speedMPerS: 20,
        slopeAngleRad: 0,
      }).input;
    expect(at(1)).toEqual({ left: false, right: false, dy: 0 });
    expect(at(pilot.takeoffLeadS / 2)).toEqual({ left: true, right: true, dy: 0 });
  });

  it("holds the flight position first, then steers the body towards its target with fresh draws", () => {
    const held = run(pilot, flightView({ phase: PHASE.flightHold }));
    expect(held.pilot.flightHoldS).toBe(f32(pilot.flightHoldS - FRAME_DT_S));
    expect(held.input.dy).toBe(0);
    const ready = { ...pilot, flightHoldS: 0, reactionLeftS: -1 };
    const high = run(ready, flightView({ bodyAngleRad: pilot.targetBodyRad + 1 }));
    expect(high.input.dy).toBe(1);
    const low = run(ready, flightView({ bodyAngleRad: pilot.targetBodyRad - 1 }));
    expect(low.input.dy).toBe(-1);
    expect(high.pilot.reactionLeftS).toBe(f32(-1 - FRAME_DT_S));
  });

  it("does not change the state it is given", () => {
    const before = structuredClone(pilot);
    run(pilot, flightView({ heightM: 0.5 }));
    expect(pilot).toEqual(before);
  });

  it("lands close to the hill and brings the telemark forward after a hard impact", () => {
    const near = run(
      { ...pilot, flightHoldS: 0 },
      flightView({ heightM: 0.5, vxMPerS: 20, vyMPerS: 20, landingPrepS: 0.5 }),
    );
    expect(near.input.right).toBe(true);
    expect(near.pilot.impactPending).toBe(false);
    const steep = run(
      { ...pilot, flightHoldS: 0 },
      flightView({ heightM: 0.5, vxMPerS: 10, vyMPerS: 25, speedMPerS: 27 }),
    );
    expect(steep.pilot.telemarkDelayS).toBeLessThan(pilot.telemarkDelayS);
  });

  it("lets go of both buttons high above the hill", () => {
    const high = run(pilot, flightView({ heightM: 20, phase: PHASE.landingPrep, landingPrepS: 1 }));
    expect(high.input.left || high.input.right).toBe(false);
  });

  it("keeps the impact correction for one evaluation and skips it on a blunder", () => {
    const blunder = run({ ...pilot, flightHoldS: 0, blunder: true }, flightView({ heightM: 0.5, vyMPerS: 6 }));
    expect(blunder.pilot.impactPending).toBe(true);
  });
});

describe("talents and form of computer jumpers", () => {
  it("draws talents within the spread of the level, and a level for the random setting", () => {
    const rng = new BorlandRandom(99);
    for (let i = 0; i < 200; i++) {
      const setting = i % (CPU_LEVEL_COUNT + 1);
      const d = drawCpuTalents(setting, rng);
      expect(setting < CPU_LEVEL_COUNT ? d.level : setting).toBe(setting);
      expect(d.level).toBeGreaterThanOrEqual(0);
      expect(d.level).toBeLessThan(CPU_LEVEL_COUNT);
      expect(f32(d.talent1)).toBe(d.talent1);
      expect(Math.abs(d.talent2)).toBeLessThanOrEqual(4 * 0.3 + 0.7);
    }
  });

  it("draws the form of a competition as two centred values", () => {
    const { form1, form2 } = drawCpuForm(new BorlandRandom(3));
    expect(Math.abs(form1)).toBeLessThanOrEqual(1);
    expect(Math.abs(form2)).toBeLessThanOrEqual(1);
  });
});

const setupFor = (presentation: boolean): JumpSetup => ({
  hill,
  kPointM: K_POINT_M,
  poses: ORIGINAL_POSES,
  wind: calmWind(),
  randomSeed: 4242,
  points: 0,
  presentation,
});

function play(presentation: boolean, record: CpuJumperRecord) {
  const setup = setupFor(presentation);
  const rng = new BorlandRandom(setup.randomSeed);
  const pilot = setupCpuPilot(record, K_POINT_M, hill, rng);
  let state: CpuJumpState = { sim: createJump({ ...setup, randomSeed: rng.seed }), pilot };
  let hash = 0x811c9dc5;
  for (let guard = 0; guard < 6000 && cpuJumpRunning(state, setup); guard++) {
    const before = structuredClone(state);
    const next = stepCpuFrame(state, setup);
    expect(state).toEqual(before);
    state = next;
    hash = stateHash(hash, state.sim);
  }
  return { state, hash: hash.toString(16) };
}

describe("a whole computer jump", () => {
  it("flies, lands and ends in the frame its result is in when nobody watches", () => {
    const { state, hash } = play(false, AVERAGE);
    expect(state.sim.logic.finished).toBe(true);
    expect(jumpRunning(state.sim)).toBe(true);
    expect(state.pilot.impactPending).toBe(false);
    expect({
      frames: state.sim.logic.frame,
      distanceM: state.sim.logic.distanceM,
      fallType: state.sim.logic.fallType,
      notes: state.sim.logic.judges.map((j) => j.note),
      hash,
    }).toMatchSnapshot();
  });

  it("runs to the end of the outrun when watched", () => {
    const { state } = play(true, AVERAGE);
    expect(jumpRunning(state.sim)).toBe(false);
    expect(state.sim.logic.distanceM).toBeGreaterThan(0);
  });

  it("keeps what the jump before left in the fields the original does not clear", () => {
    const { state } = play(false, AVERAGE);
    const next = createJump(setupFor(false), state.sim);
    expect(next.logic.distanceM).toBe(state.sim.logic.distanceM);
    expect(next.jumper.vxMPerS).toBe(state.sim.jumper.vxMPerS);
    expect(next.logic.phase).toBe(PHASE.gate);
    expect(next.jumper.airborne).toBe(false);
    const fresh = createJump(setupFor(false));
    expect(fresh.logic.distanceM).toBe(0);
  });
});
