import type { HillChoice } from "../game/hill-choice";
import { isJumpOver, stepTrainingJump } from "../game/training-session";
import { PHASE } from "../sim/jump-logic";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import { decodeInputs, encodeInputs } from "../storage/input-codec";
import { ENGINE_REVISION, type ShelfEntry, type ShelfKind } from "../storage/replay-shelf";
import { originalReplaySource, recordingSource, type JumpRecording, type ReplaySource } from "./jump-replay";
import { jumpResult, stepJump, type JumpResult } from "./jump-round";

/** The longest a replay may run before it counts as one that never ends (a jump is 900 to 1600 frames). */
const MAX_REPLAY_FRAMES = 6000;
/** Frames stepped at a time when a replay is played through to check it. */
const CHECK_STEP_FRAMES = 50;

/** The id of a training jump on the shelf: one per jump and kind, so the same jump is never kept twice. */
function shelfId(kind: ShelfKind, hill: HillChoice, recording: JumpRecording, dateIso: string): string {
  return `${kind}:${hill.id}:${dateIso}:${recording.seed}`;
}

/** A training jump as the shelf keeps it. */
export function ownEntry(
  kind: ShelfKind,
  hill: HillChoice,
  jump: { recording: JumpRecording; result: JumpResult },
  now: Date,
): ShelfEntry {
  const dateIso = now.toISOString();
  return {
    id: shelfId(kind, hill, jump.recording, dateIso),
    kind,
    hill: { id: hill.id, name: hill.name, kPointM: hill.kPointM },
    dateIso,
    result: jump.result,
    newRecord: jump.recording.newRecord,
    engineRevision: ENGINE_REVISION,
    replay: {
      kind: "own",
      seed: jump.recording.seed,
      inputs: encodeInputs(jump.recording.inputs),
      ...(jump.recording.scenery === undefined ? {} : { scenery: jump.recording.scenery }),
    },
  };
}

/** The bytes of a text in base64; null when it is not one. */
export function bytesOfBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** What plays a replay of the shelf; null when its data cannot be read. */
export function sourceOfEntry(entry: ShelfEntry): ReplaySource | null {
  const { replay } = entry;
  if (replay.kind === "own") {
    const inputs = decodeInputs(replay.inputs);
    if (inputs === null) return null;
    const { seed, scenery } = replay;
    return recordingSource({ seed, inputs, newRecord: entry.newRecord, ...(scenery === undefined ? {} : { scenery }) });
  }
  const file = bytesOfBase64(replay.rpl);
  if (file === null) return null;
  try {
    const { header, record } = decodeReplayFile(file);
    return originalReplaySource(parseReplayRecord(header, record));
  } catch {
    return null;
  }
}

/**
 * The phases in which the jump does not react to the mouse: on the gate, in the inrun and in the outrun; and, as
 * far as it does not move the fallen jumper, after a fall.
 */
const STILL_PHASES: ReadonlySet<number> = new Set([PHASE.gate, PHASE.inrun, PHASE.crouch, PHASE.outrun]);
const STILL_PHASES_AFTER_FALL: ReadonlySet<number> = new Set([...STILL_PHASES, PHASE.crash]);

/** A recording played through: its end state as text, and the phase each of its inputs was taken in. */
function playedRecording(hill: HillChoice, recording: JumpRecording): { end: string; phases: number[] } | null {
  const source = recordingSource(recording);
  let jump = source.start(hill);
  const phases: number[] = [];
  for (let f = 0; f < MAX_REPLAY_FRAMES && !isJumpOver(jump); f++) {
    // The input of index i is taken when the logic is at frame i + 1.
    phases[jump.state.logic.frame - 1] = jump.state.logic.phase;
    jump = stepTrainingJump(jump, source.input(jump.state.logic));
  }
  return isJumpOver(jump) ? { end: JSON.stringify(jump.state), phases } : null;
}

/**
 * The recording without the mouse motion the jump did not react to (on the gate, in the inrun, in the outrun and
 * after a fall, where a mouse moved all along keeps moving), which makes the stored replay much smaller. Only when
 * the jump played without it ends in the same state; otherwise it keeps the motion of the fall, or all of it.
 */
export function slimRecording(hill: HillChoice, recording: JumpRecording): JumpRecording {
  const whole = playedRecording(hill, recording);
  if (whole === null) return recording;
  for (const still of [STILL_PHASES_AFTER_FALL, STILL_PHASES]) {
    const inputs = recording.inputs.map((input, i) =>
      input.dy !== 0 && still.has(whole.phases[i] ?? PHASE.gate) ? { ...input, dy: 0 } : input,
    );
    if (inputs.every((input, i) => input === recording.inputs[i])) continue;
    const slim = { ...recording, inputs };
    if (playedRecording(hill, slim)?.end === whole.end) return slim;
  }
  return recording;
}

/** The result a replay plays to, from its start to where the jumper stops; null when it never stops. */
export function playedResult(source: ReplaySource, hill: HillChoice): JumpResult | null {
  let jump = source.start(hill);
  for (let f = 0; f < MAX_REPLAY_FRAMES && !isJumpOver(jump); f += CHECK_STEP_FRAMES) {
    jump = stepJump(jump, { steps: CHECK_STEP_FRAMES, leftHeld: false, record: undefined }, source.input).jump;
  }
  return isJumpOver(jump) ? jumpResult(jump) : null;
}

/** The replay of a hill's record, ready to play from the hill list; null when there is none or it no longer fits. */
export function recordReplayOf(shelf: readonly ShelfEntry[], hill: HillChoice): ReplaySource | null {
  const entry = shelf.find((e) => e.kind === "record" && e.hill.id === hill.id);
  const source = entry ? sourceOfEntry(entry) : null;
  // Opened from a list, the replay leads back to the replays, like one opened on their screen.
  return entry && source && entryPlaysTrue(entry, source, hill) ? { ...source, origin: "original" } : null;
}

/**
 * Whether a replay of the shelf still plays to the jump it was kept as. It may not, after a change of the game's
 * physics or when the data was changed; such a replay is not shown as that jump.
 */
export function entryPlaysTrue(entry: ShelfEntry, source: ReplaySource, hill: HillChoice): boolean {
  const played = playedResult(source, hill);
  return (
    played !== null &&
    played.distanceM === entry.result.distanceM &&
    played.points === entry.result.points &&
    played.fell === entry.result.fell
  );
}
