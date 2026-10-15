import { BorlandRandom } from "../sim/borland-random";
import type { FrameInput } from "../sim/jump-logic";
import { parseReplayRecord, replayInputForFrame } from "../sim/replay";
import type { WindState } from "../sim/wind";

/**
 * Replay files of the original game (.rpl, docs/replay-format.md) written by this game: the input of a jump in
 * the form the original keeps it (a plan), the 1205-byte record made from it and the encrypted file around the
 * record. The decoder is in src/sim/replay.ts; this is its inverse.
 */

export const BUTTON_WINDOW_FRAMES = 20;
/** Motion bytes of a record: offsets 0x30..0x448. */
export const MOTION_CAPACITY_FRAMES = 0x449 - 0x30;
const RECORD_BYTES = 0x4b5;
const REPLAY_KEY = 0x26b51b17;

const OFFSET = {
  wind: 0x00,
  hillNumber: 0x20,
  distanceText: 0x25,
  randomSeed: 0x2c,
  motion: 0x30,
  startFrame: 0x44a,
  buttonWindowStart: 0x44e,
  motionStart: 0x452,
  buttonWindow: 0x456,
  leftLandingFrame: 0x46a,
  rightLandingFrame: 0x46e,
  motionEnd: 0x472,
  jumperName: 0x476,
  date: 0x490,
} as const;

/** Longest texts of a record, by their Pascal string sizes (string[6], string[25], string[10]). */
const TEXT_MAX_CHARS = { distanceText: 6, jumperName: 25, date: 10 } as const;

/** Hills up to this number get the header of version 2.00, the later ones that of 2.1P (190d:05ca). */
const LAST_HILL_OF_V200 = 32;

/** The 13 characters the original writes before the record of a replay of this hill. */
export function replayHeader(hillNumber: number): Uint8Array {
  return new TextEncoder().encode(hillNumber <= LAST_HILL_OF_V200 ? "//DSJ_v2.00//" : "//DSJ_v2.1P//");
}

export interface ReplayPlan {
  /** Hill number of the original game, 1 to 37 (0 for a hill that is not one of them). */
  hillNumber: number;
  randomSeed: number;
  wind: WindState;
  /** Frame of the left press that leaves the gate; 0 when there is none. */
  startFrame: number;
  /** First frame of the takeoff window; 0 when no button is pressed around the takeoff. */
  buttonWindowStart: number;
  /** One value per frame of the window: 0 no button, 1 left, 2 left and right. */
  buttonWindow: number[];
  /** First and last frame with vertical mouse motion; an empty range is 1..0. */
  motionStart: number;
  motionEnd: number;
  /** Mouse motion in mickeys (-128..127) for motionStart..motionEnd. */
  motion: number[];
  /** Frames of the landing presses; 0 when there is none. */
  leftLandingFrame: number;
  rightLandingFrame: number;
}

export interface PlanBase {
  hillNumber: number;
  randomSeed: number;
  wind: WindState;
}

/** What the replay studio of the original shows about a replay; the jump itself does not depend on it. */
export interface ReplayLabels {
  /** The distance as the original writes it, such as "89.92". */
  distanceText: string;
  jumperName: string;
  /** "YYYY/MM/DD". */
  date: string;
}

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

const sameInput = (one: FrameInput, other: FrameInput): boolean =>
  one.left === other.left && one.right === other.right && one.dy === other.dy;

function assertPlanFits(plan: ReplayPlan): void {
  const frames = [
    plan.startFrame,
    plan.buttonWindowStart,
    plan.motionStart,
    plan.motionEnd,
    plan.leftLandingFrame,
    plan.rightLandingFrame,
  ];
  if (!Number.isInteger(plan.hillNumber) || plan.hillNumber < 0 || plan.hillNumber > 255) {
    throw new RangeError(`hill number ${plan.hillNumber} does not fit in a byte`);
  }
  if (frames.some((frame) => !Number.isInteger(frame) || frame < 0)) {
    throw new RangeError("frame numbers of a plan must be non-negative integers");
  }
  if (plan.buttonWindow.length !== BUTTON_WINDOW_FRAMES || plan.buttonWindow.some((b) => ![0, 1, 2].includes(b))) {
    throw new RangeError(`the takeoff window needs ${BUTTON_WINDOW_FRAMES} values of 0, 1 or 2`);
  }
  if (plan.motion.length !== plan.motionEnd - plan.motionStart + 1) {
    throw new RangeError("the motion list does not match its first and last frame");
  }
  if (plan.motion.length > MOTION_CAPACITY_FRAMES) {
    throw new RangeError(`motion spans ${plan.motion.length} frames, a replay holds ${MOTION_CAPACITY_FRAMES}`);
  }
  if (plan.motion.some((dy) => !Number.isInteger(dy) || dy < -128 || dy > 127)) {
    throw new RangeError("mouse motion must be an integer in -128..127");
  }
}

/** A Pascal string: a length byte, then one byte per character; other than printable ASCII becomes "?". */
function pascalBytes(text: string, maxChars: number): number[] {
  const codes = Array.from(text, (char) => char.codePointAt(0) ?? 0).slice(0, maxChars);
  return [codes.length, ...codes.map((code) => (code >= 0x20 && code < 0x7f ? code : 0x3f))];
}

/**
 * The 1205-byte record of a replay with the plan's fields set and everything else zero, or with the labels the
 * replay studio shows. The record of the hill at the time of the jump stays 0: the original then shows none.
 */
export function planToRecord(plan: ReplayPlan, labels?: ReplayLabels): Uint8Array {
  assertPlanFits(plan);
  const record = new Uint8Array(RECORD_BYTES);
  const view = new DataView(record.buffer);
  const wind = [
    plan.wind.xMPerS,
    plan.wind.yMPerS,
    plan.wind.variabilityMPerS,
    plan.wind.speedMPerS,
    plan.wind.directionRad,
    plan.wind.indicatorDirectionRad,
    plan.wind.indicatorTurnRateRad,
    plan.wind.indicatorMaxTurnRateRad,
  ];
  wind.forEach((value, i) => view.setFloat32(OFFSET.wind + 4 * i, value, true));
  view.setUint8(OFFSET.hillNumber, plan.hillNumber);
  view.setUint32(OFFSET.randomSeed, plan.randomSeed >>> 0, true);
  plan.motion.forEach((dy, i) => view.setInt8(OFFSET.motion + i, dy));
  plan.buttonWindow.forEach((buttons, i) => view.setUint8(OFFSET.buttonWindow + i, buttons));
  view.setInt32(OFFSET.startFrame, plan.startFrame, true);
  view.setInt32(OFFSET.buttonWindowStart, plan.buttonWindowStart, true);
  view.setInt32(OFFSET.motionStart, plan.motionStart, true);
  view.setInt32(OFFSET.motionEnd, plan.motionEnd, true);
  view.setInt32(OFFSET.leftLandingFrame, plan.leftLandingFrame, true);
  view.setInt32(OFFSET.rightLandingFrame, plan.rightLandingFrame, true);
  if (labels) {
    record.set(pascalBytes(labels.distanceText, TEXT_MAX_CHARS.distanceText), OFFSET.distanceText);
    record.set(pascalBytes(labels.jumperName, TEXT_MAX_CHARS.jumperName), OFFSET.jumperName);
    record.set(pascalBytes(labels.date, TEXT_MAX_CHARS.date), OFFSET.date);
  }
  return record;
}

function random31(rng: BorlandRandom): number {
  const hi = rng.below(0x8000);
  const lo = rng.below(0xffff);
  return (hi * 0x10000 + lo) >>> 0;
}

/** The file the original writes for a header and a record: both encrypted, then the checksum (1b8f). */
export function encodeReplayFile(header: Uint8Array, record: Uint8Array): Uint8Array<ArrayBuffer> {
  const plain = new Uint8Array([...header, ...record]);
  const out = new Uint8Array(plain.length + 4);
  const rng = new BorlandRandom(REPLAY_KEY);
  let checksum = random31(rng);
  for (let i = 0; i < plain.length; i++) {
    const k = rng.below(0x100);
    const c = ((plain[i] ?? 0) + k) & 0xff;
    rng.seed = rng.seed + c;
    checksum = (checksum + (c - 1) * Math.floor(random31(rng) / 256)) >>> 0;
    out[i] = c;
  }
  new DataView(out.buffer).setUint32(plain.length, checksum, true);
  return out;
}

/** The input a replay made from the plan gives in each frame, read back through the replay decoder. */
export function planInputSource(plan: ReplayPlan): (frame: number) => FrameInput {
  const replay = parseReplayRecord(replayHeader(plan.hillNumber), planToRecord(plan));
  return (frame) => replayInputForFrame(replay, frame);
}

function windowButtons(input: FrameInput): number {
  if (input.left) return input.right ? 2 : 1;
  return 0;
}

const isPressed = (input: FrameInput | undefined): boolean => input !== undefined && (input.left || input.right);

/**
 * A plan of per-frame input (index = frame number): the first press is the start when it is the left button alone,
 * the takeoff window opens at `windowStart` (0 for none: the reader then takes frames 0 to 19 as the window), the
 * first press of each button outside it is that landing press, and the motion runs from its first frame to its last.
 */
function buildPlan(inputs: readonly FrameInput[], base: PlanBase, windowStart: number): ReplayPlan {
  const pressed = inputs.flatMap((input, frame) => (input.left || input.right ? [{ ...input, frame }] : []));
  const [first] = pressed;
  const startFrame = first !== undefined && first.left && !first.right ? first.frame : 0;
  const afterWindow = pressed.filter(
    (press) =>
      press.frame !== startFrame && (press.frame < windowStart || press.frame >= windowStart + BUTTON_WINDOW_FRAMES),
  );
  const moving = inputs.flatMap((input, frame) => (input.dy === 0 ? [] : [frame]));
  const motionStart = moving[0] ?? 1;
  const motionEnd = moving.at(-1) ?? 0;
  return {
    ...base,
    startFrame,
    buttonWindowStart: windowStart,
    buttonWindow: Array.from({ length: BUTTON_WINDOW_FRAMES }, (_, i) =>
      windowButtons(inputs[windowStart + i] ?? NO_INPUT),
    ),
    motionStart,
    motionEnd,
    motion: inputs.slice(motionStart, motionEnd + 1).map((input) => input.dy),
    leftLandingFrame: afterWindow.find((press) => press.left)?.frame ?? 0,
    rightLandingFrame: afterWindow.find((press) => press.right)?.frame ?? 0,
  };
}

const planFits = (plan: ReplayPlan): boolean => plan.motion.length <= MOTION_CAPACITY_FRAMES;

/**
 * Where the takeoff window of a plan may open: at the first press after the start press, or so that it ends with
 * the last frame of the presses that follow it without a gap (the takeoff), which leaves a press soon after the
 * takeoff (the landing on a small hill) outside the window, where it has a place of its own.
 */
function windowStarts(inputs: readonly FrameInput[]): number[] {
  const presses = inputs.flatMap((input, frame) => (isPressed(input) ? [frame] : []));
  const startFrame = presses[0] !== undefined && inputs[presses[0]]?.right === false ? presses[0] : 0;
  const first = presses.find((frame) => frame !== startFrame) ?? 0;
  const gap = inputs.findIndex((input, frame) => frame > first && !isPressed(input));
  const last = first === 0 ? 0 : (gap === -1 ? inputs.length : gap) - 1;
  const ending = Math.max(startFrame + 1, last - BUTTON_WINDOW_FRAMES + 1);
  return ending < first ? [first, ending] : [first];
}

function reproduces(plan: ReplayPlan, inputs: readonly FrameInput[]): boolean {
  const source = planInputSource(plan);
  // Frames past the recorded ones must stay without input for as long as a replay can hold any.
  const frames = inputs.length + BUTTON_WINDOW_FRAMES + MOTION_CAPACITY_FRAMES;
  return Array.from({ length: frames }, (_, frame) => frame).every((frame) =>
    sameInput(source(frame), inputs[frame] ?? NO_INPUT),
  );
}

/**
 * Turns per-frame input (index = frame number) into a plan that gives back the input of every frame. Throws when
 * a replay cannot hold the input: its format stores one start press, 20 frames of takeoff buttons, one press of
 * each landing button and at most MOTION_CAPACITY_FRAMES frames of mouse motion.
 */
export function planFromInputs(inputs: readonly FrameInput[], base: PlanBase): ReplayPlan {
  for (const windowStart of [...windowStarts(inputs), 0]) {
    const plan = buildPlan(inputs, base, windowStart);
    if (planFits(plan) && reproduces(plan, inputs)) {
      return plan;
    }
  }
  throw new RangeError("the input does not fit the replay format");
}
