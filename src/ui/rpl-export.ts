import { originalHillNumber, type HillChoice } from "../game/hill-choice";
import { isJumpOver, startRecordedJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import {
  BUTTON_WINDOW_FRAMES,
  encodeReplayFile,
  planFromInputs,
  planToRecord,
  replayHeader,
  type ReplayLabels,
} from "../storage/original-replay-file";
import { decodeInputs, type ShelfEntry } from "../storage/replay-shelf";
import { UI_TEXT } from "../text/ui-text";
import { originalReplaySource, type ReplaySource } from "./jump-replay";
import { bytesOfBase64, entryPlaysTrue, sourceOfEntry } from "./shelf-replays";

const T = UI_TEXT.replays;
/** The longest a replay may run before it counts as one that never ends (a jump is 900 to 1600 frames). */
const MAX_REPLAY_FRAMES = 6000;
const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** A replay of the shelf as a file of the original, or what to tell the player. */
export type RplExport = { ok: true; file: Uint8Array<ArrayBuffer> } | { ok: false; message: string };

/** Whether a replay can become a file of the original: it is one, or it was jumped on one of the original's hills. */
export const rplExportable = (entry: ShelfEntry): boolean =>
  entry.replay.kind === "original" || originalHillNumber(entry.hill.id) !== null;

/** The jump a replay plays to, played through to where the jumper stops; null when it never stops. */
function playedThrough(source: ReplaySource, hill: HillChoice): TrainingJump | null {
  let jump = source.start(hill);
  for (let f = 0; f < MAX_REPLAY_FRAMES && !isJumpOver(jump); f++) {
    jump = stepTrainingJump(jump, source.input(jump.state.logic));
  }
  return isJumpOver(jump) ? jump : null;
}

/** The frames in which a replay's jump turned to another phase (left the gate, took off, landed...). */
function phaseTurns(source: ReplaySource, hill: HillChoice): number[] {
  let jump = source.start(hill);
  const turns: number[] = [];
  for (let f = 0; f < MAX_REPLAY_FRAMES && !isJumpOver(jump); f++) {
    const phase = jump.state.logic.phase;
    jump = stepTrainingJump(jump, source.input(jump.state.logic));
    if (jump.state.logic.phase !== phase) turns.push(jump.state.logic.frame);
  }
  return turns;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** What the replay studio of the original shows: the distance, the player and the day of the jump. */
function labelsOf(entry: ShelfEntry): ReplayLabels {
  const day = new Date(entry.dateIso);
  return {
    distanceText: entry.result.distanceM.toFixed(2),
    jumperName: UI_TEXT.hud.playerName,
    date: `${day.getFullYear()}/${pad2(day.getMonth() + 1)}/${pad2(day.getDate())}`,
  };
}

/**
 * The name the file is offered under: day, hour, minute and second of the jump. The original runs under DOS and
 * lists its replays by names of at most eight characters; the month and the year are in the file itself.
 */
export function rplFileName(entry: ShelfEntry): string {
  const when = new Date(entry.dateIso);
  return `${[when.getDate(), when.getHours(), when.getMinutes(), when.getSeconds()].map(pad2).join("")}.rpl`;
}

/**
 * Presses tried one by one for whether the jump reacted to them. A jump has a handful (gate, start, takeoff, two
 * landing buttons); each try plays the whole jump up to four times, so the limit keeps the check short on a phone.
 */
const MAX_PRESSES_TRIED = 12;

/** One press: a button held down over consecutive frames, from `from` up to and without `to`. */
interface Press {
  button: "left" | "right";
  from: number;
  to: number;
}

function pressesOf(inputs: readonly FrameInput[]): Press[] {
  return (["left", "right"] as const).flatMap((button) =>
    inputs.flatMap((input, frame) => {
      if (!input[button] || inputs[frame - 1]?.[button] === true) return [];
      const to = inputs.findIndex((later, at) => at > frame && !later[button]);
      return [{ button, from: frame, to: to === -1 ? inputs.length : to }];
    }),
  );
}

const pressesInOrder = (inputs: readonly FrameInput[]): Press[] =>
  pressesOf(inputs).toSorted((one, other) => one.from - other.from);

/** The input with the press kept only from `keepFrom` up to `keepTo` (an empty range leaves it out). */
const keepPart = (inputs: readonly FrameInput[], press: Press, keepFrom: number, keepTo: number): FrameInput[] =>
  inputs.map((input, frame) =>
    frame >= press.from && frame < press.to && (frame < keepFrom || frame >= keepTo)
      ? { ...input, [press.button]: false }
      : input,
  );

/**
 * The parts of a press to try in its place, the likeliest first: the frame the jump turned in, its first frame,
 * none, the takeoff window.
 */
function partsOf(press: Press, turns: readonly number[]): [number, number][] {
  const inside = turns.filter((frame) => frame >= press.from && frame < press.to);
  const parts: [number, number][] = [
    ...inside.map((frame): [number, number] => [frame, frame + 1]),
    [press.from, press.from + 1],
    [press.from, press.from],
    [press.from, press.from + BUTTON_WINDOW_FRAMES],
  ];
  return parts.filter(([from, to]) => to - from < press.to - press.from);
}

/** The input with the left button down too over the frames of `press`. */
const withLeftBeside = (inputs: readonly FrameInput[], press: Press): FrameInput[] =>
  inputs.map((input, frame) => (frame >= press.from && frame < press.to ? { ...input, left: true } : input));

const withoutMotionBefore = (inputs: readonly FrameInput[], end: number): FrameInput[] =>
  inputs.map((input, frame) => (frame < end && input.dy !== 0 ? { ...input, dy: 0 } : input));

/**
 * The input of a jump without what the jump did not react to: a press on the gate, another press in the air after
 * the landing one, a button held on around the frame that counted (a click of the mouse lasts several frames, a
 * button held on the gate starts the jump only once the gate lets it, and the original keeps the start and the
 * landing presses as one frame), motion in the inrun. A press is left out, or kept only in the frame in which the
 * jump turned to its next phase, in its first frame or over the takeoff window, only when the jump played so ends
 * in the same state; what is left plays the same jump, and the format of the original can often hold it then.
 */
function essentialInputs(
  inputs: readonly FrameInput[],
  turns: readonly number[],
  samePlay: (inputs: readonly FrameInput[]) => boolean,
): readonly FrameInput[] {
  const fewerPresses = pressesInOrder(inputs)
    .slice(0, MAX_PRESSES_TRIED)
    .reduce<readonly FrameInput[]>((kept, press) => {
      for (const [keepFrom, keepTo] of partsOf(press, turns)) {
        const fewer = keepPart(kept, press, keepFrom, keepTo);
        if (samePlay(fewer)) return fewer;
      }
      return kept;
    }, inputs);
  // The takeoff window keeps the right button only with the left one: a tap of the right one alone in it (two
  // thumbs a few frames apart on a phone) may take the left one beside it, when the jump stays the same.
  const paired = pressesInOrder(fewerPresses)
    .filter((press) => press.button === "right" && fewerPresses[press.from]?.left === false)
    .reduce<readonly FrameInput[]>((kept, press) => {
      const both = withLeftBeside(kept, press);
      return samePlay(both) ? both : kept;
    }, fewerPresses);
  // The takeoff is the first press after the start; motion before it is the inrun's.
  const takeoff = pressesInOrder(paired)[1];
  const stiller = takeoff ? withoutMotionBefore(paired, takeoff.from) : paired;
  return stiller !== paired && samePlay(stiller) ? stiller : paired;
}

/** A file of the original made from a jump of this game, checked by playing it: the same jump, or null. */
function ownJumpFile(
  entry: ShelfEntry,
  hill: HillChoice,
  hillNumber: number,
  jump: TrainingJump,
): Uint8Array<ArrayBuffer> | null {
  const inputs = entry.replay.kind === "own" ? decodeInputs(entry.replay.inputs) : null;
  if (inputs === null) return null;
  const start = { wind: jump.setup.wind, randomSeed: jump.setup.randomSeed };
  const expected = JSON.stringify(jump.state);
  const playsTrue = (source: ReplaySource): boolean => {
    const played = playedThrough(source, hill);
    return played !== null && JSON.stringify(played.state) === expected;
  };
  const byFrameSource = (byFrame: readonly FrameInput[]): ReplaySource => ({
    start: (h) => startRecordedJump(h, start),
    input: (logic) => byFrame[logic.frame + 1] ?? NO_INPUT,
    newRecord: false,
    origin: "own",
  });
  // The recording starts with the input that computes frame 2; a plan is indexed by the frame being computed.
  const byFrame = [NO_INPUT, NO_INPUT, ...inputs];
  const base = { hillNumber, randomSeed: start.randomSeed >>> 0, wind: start.wind };
  const fileOf = (tried: readonly FrameInput[]): Uint8Array<ArrayBuffer> | null => {
    const plan = planOf(tried, base);
    if (plan === null) return null;
    const file = encodeReplayFile(replayHeader(hillNumber), planToRecord(plan, labelsOf(entry)));
    const { header, record } = decodeReplayFile(file);
    return playsTrue(originalReplaySource(parseReplayRecord(header, record))) ? file : null;
  };
  // Most jumps fit as they were played; the others are tried again without what they did not react to.
  return (
    fileOf(byFrame) ??
    fileOf(
      essentialInputs(byFrame, phaseTurns(byFrameSource(byFrame), hill), (fewer) => playsTrue(byFrameSource(fewer))),
    )
  );
}

/** The plan that gives back this input frame by frame; null when the format cannot hold it. */
function planOf(byFrame: readonly FrameInput[], base: Parameters<typeof planFromInputs>[1]) {
  try {
    return planFromInputs(byFrame, base);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * A replay of the shelf as a file the original can play. A file of the original goes out as it came. A jump of
 * this game has to play true first, then becomes a file only when the file, played here, is the same jump to the
 * last frame: the format keeps one start press, one window of takeoff buttons, one press of each button at the
 * landing and a limited stretch of motion, and some jumps need more.
 */
export function rplExport(entry: ShelfEntry, hills: readonly HillChoice[]): RplExport {
  if (entry.replay.kind === "original") {
    const file = bytesOfBase64(entry.replay.rpl);
    return file === null ? { ok: false, message: T.notTrue } : { ok: true, file };
  }
  const hillNumber = originalHillNumber(entry.hill.id);
  const hill = hills.find((h) => h.id === entry.hill.id);
  if (hillNumber === null || hill === undefined) return { ok: false, message: T.hillMissing };
  const source = sourceOfEntry(entry);
  const jump = source && entryPlaysTrue(entry, source, hill) ? playedThrough(source, hill) : null;
  if (source === null || jump === null) return { ok: false, message: T.notTrue };
  const file = ownJumpFile(entry, hill, hillNumber, jump);
  return file === null ? { ok: false, message: T.rplUnfit } : { ok: true, file };
}
