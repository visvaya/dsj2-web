import type { HillChoice } from "../game/hill-choice";
import type { Scenery } from "../render/jump-view";
import { decodeCp852 } from "../original/dsj-dat";
import { startRecordedJump, startTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput, JumpLogicState } from "../sim/jump-logic";
import { replayInputForFrame, type ReplayRecord } from "../sim/replay";

/** A jump as it can be played again: the seed it started from and the input of every frame the simulation ran. */
export interface JumpRecording {
  seed: number;
  inputs: readonly FrameInput[];
  /** Whether the jump set a new hill record, as it was told then. */
  newRecord: boolean;
  /** The look of the hill during the jump; absent for a jump kept before it was recorded. */
  scenery?: Scenery;
}

/** The tempos a replay plays at, as shares of real time; the first is the one it starts with. */
export const REPLAY_SPEEDS = [1, 0.5, 0.25] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** A tempo as the picture and the menu show it. */
export const REPLAY_SPEED_LABEL: Readonly<Record<ReplaySpeed, string>> = { 1: "1", 0.5: "1/2", 0.25: "1/4" };

/**
 * Where a replay was opened: "own" is the player's last jump, watched right after it; "original" is one opened on
 * the replay screen (a file of the original, or a replay kept there). It decides what the menu offers and what a
 * press does once the replay is over.
 */
export type ReplayOrigin = "own" | "original";

/** How a replay is being watched. */
export interface ReplayView {
  speed: ReplaySpeed;
  paused: boolean;
  origin: ReplayOrigin;
}

/** A replay as it starts: at full tempo, playing. */
export const replayStart = (origin: ReplayOrigin): ReplayView => ({ speed: REPLAY_SPEEDS[0], paused: false, origin });

/** The tempo after `speed`, from the slowest back to the first. */
export function nextReplaySpeed(speed: ReplaySpeed): ReplaySpeed {
  const at = REPLAY_SPEEDS.indexOf(speed);
  return REPLAY_SPEEDS[(at + 1) % REPLAY_SPEEDS.length] ?? REPLAY_SPEEDS[0];
}

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/**
 * The recorded input of the frame after the one the logic is at. A training jump starts at frame 1 and every
 * frame the simulation runs moves it on by one, so the first recorded input belongs to frame 1.
 */
export function recordedInput(recording: JumpRecording, logic: Pick<JumpLogicState, "frame">): FrameInput {
  return recording.inputs[logic.frame - 1] ?? NO_INPUT;
}

/** What a replay plays: how its jump starts, the input of each frame, and what the picture tells about it. */
export interface ReplaySource {
  start: (hill: HillChoice) => TrainingJump;
  /** The input of the frame after the one the logic is at. */
  input: (logic: Pick<JumpLogicState, "frame">) => FrameInput;
  /** Whether the jump set a new hill record, as it was told then. */
  newRecord: boolean;
  origin: ReplayOrigin;
  /** The jumper's name for the bar of the picture; the player's own when absent. */
  jumperName?: string;
  /** The look of the hill the jump had; the look of the visit when absent (a file of the original keeps none). */
  scenery?: Scenery;
}

/** A training jump of this game, from its seed and the inputs it was given. */
export function recordingSource(recording: JumpRecording): ReplaySource {
  return {
    start: (hill) => startTrainingJump(hill, recording.seed),
    input: (logic) => recordedInput(recording, logic),
    newRecord: recording.newRecord,
    origin: "own",
    ...(recording.scenery === undefined ? {} : { scenery: recording.scenery }),
  };
}

/**
 * The jumper's name as the original wrote it, in code page 852 like its other texts. The record reader gives each
 * byte as one character, so the bytes come back unchanged.
 */
function jumperNameOf(record: ReplayRecord): string {
  return decodeCp852(Uint8Array.from(record.jumperName, (char) => char.charCodeAt(0) & 0xff));
}

/** Longest name the bar shows; the original keeps up to 25 characters. */
const JUMPER_NAME_MAX_CHARS = 25;

/**
 * A replay of the original game: its wind and generator state, and the input as the original keeps it, by the
 * number of the frame being computed (190d:026d), which is the frame after the one the logic is at.
 */
export function originalReplaySource(record: ReplayRecord): ReplaySource {
  const name = jumperNameOf(record).trim().slice(0, JUMPER_NAME_MAX_CHARS).toUpperCase();
  return {
    start: (hill) => startRecordedJump(hill, { wind: record.wind, randomSeed: record.randomSeed }),
    input: (logic) => replayInputForFrame(record, logic.frame + 1),
    newRecord: false,
    origin: "original",
    ...(name === "" ? {} : { jumperName: name }),
  };
}
