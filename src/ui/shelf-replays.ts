import type { HillChoice } from "../game/hill-choice";
import { isJumpOver } from "../game/training-session";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import { ENGINE_REVISION, decodeInputs, encodeInputs, type ShelfEntry, type ShelfKind } from "../storage/replay-shelf";
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
    replay: { kind: "own", seed: jump.recording.seed, inputs: encodeInputs(jump.recording.inputs) },
  };
}

function bytesOfBase64(text: string): Uint8Array | null {
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
    return inputs === null ? null : recordingSource({ seed: replay.seed, inputs, newRecord: entry.newRecord });
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

/** The result a replay plays to, from its start to where the jumper stops; null when it never stops. */
export function playedResult(source: ReplaySource, hill: HillChoice): JumpResult | null {
  let jump = source.start(hill);
  for (let f = 0; f < MAX_REPLAY_FRAMES && !isJumpOver(jump); f += CHECK_STEP_FRAMES) {
    jump = stepJump(jump, { steps: CHECK_STEP_FRAMES, leftHeld: false, record: undefined }, source.input).jump;
  }
  return isJumpOver(jump) ? jumpResult(jump) : null;
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
