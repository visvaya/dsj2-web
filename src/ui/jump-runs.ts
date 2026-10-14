import type { RefObject } from "react";
import type { SoundEngine } from "../audio/sound-engine";
import { vibrate } from "../game/haptics";
import type { HillChoice } from "../game/hill-choice";
import { leftTouchLeansOnly, rightTouchEndsPreparation, type PlayerInput } from "../game/player-input";
import {
  isJumpOver,
  newSeed,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import type { ControlScheme, Scenery } from "../render/jump-view";
import type { FrameInput, JumpLogicState } from "../sim/jump-logic";
import { beatsRecord, type HillRecord, type Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { JUMP_STARTED_ANNOUNCEMENT, resultAnnouncement, touchdownAnnouncement } from "./jump-announcement";
import { recordingSource, replayStart, type JumpRecording, type ReplaySource, type ReplayView } from "./jump-replay";
import { jumpResult, stepJump, type JumpCue, type JumpResult } from "./jump-round";
import type { JumpSounds } from "./jump-sounds";

/** What the loop reads anew in every frame: it outlives a render. */
export interface LiveProps {
  onFinished: (result: JumpResult) => void;
  record: HillRecord | undefined;
  settings: Settings;
  controls: ControlScheme;
  scenery: Scenery;
  /** How the replay is being watched, while one plays. */
  replay: ReplayView | null;
}

/** What the runs need from the screen. */
export interface RunContext {
  live: LiveProps;
  inputRef: RefObject<PlayerInput>;
  /** Lets go of everything held, for a jump that starts again. */
  resetHands: () => void;
  soundRef: RefObject<SoundEngine | null>;
  announce: (text: string) => void;
  /** Tells whether a finished jump can be watched again. */
  onReplayAvailable: (available: boolean) => void;
  /** Tells how the replay is to be watched now, or that none plays. */
  onReplayChange: (view: ReplayView | null) => void;
  /** Opens the menu of the jump screen, where a replay of the original goes on once it is over. */
  openMenu: () => void;
}

/** A run of jumps on the hill: what a picture frame does to it, and what starts its jump again. */
interface JumpRun {
  /** Steps the jump by `steps` simulation frames, with the moments that come of it. */
  step: (steps: number) => void;
  /**
   * Handles a jump that is over. Returns whether the jump was over, and its presentation frame, as they were
   * before a new jump started.
   */
  settle: () => { over: boolean; clock: number };
  restart: () => void;
  /** The jump, and whether it beats the record (known from the touchdown on). */
  now: () => { jump: TrainingJump; newRecord: boolean };
}

/** Feels and plays the moments of the jump, and tells a screen reader when the jumper leaves the gate. */
function playCues(cues: readonly JumpCue[], c: RunContext, feel: boolean): void {
  for (const cue of cues) {
    if (cue.kind === "feedback") {
      if (feel && c.live.settings.vibration) vibrate(cue.event);
      c.soundRef.current?.play(cue.event);
      if (cue.event === "start") c.announce(JUMP_STARTED_ANNOUNCEMENT);
    } else {
      c.soundRef.current?.play(cue.event);
    }
  }
}

interface TrainingRun extends JumpRun {
  /** The last jump that ended, to be watched again; null before the first. */
  lastRecording: () => JumpRecording | null;
}

/**
 * The training jumps on a hill, from the player's input: a finished jump is reported once, kept for a replay,
 * and a fresh press of the left button after it starts the next.
 */
function createTrainingRun(
  hill: HillChoice,
  c: () => RunContext,
  sounds: JumpSounds,
  releaseMouse: () => void,
): TrainingRun {
  const input = c().inputRef.current;
  let jump: TrainingJump = startTrainingJump(hill, newSeed());
  let inputs: FrameInput[] = [];
  let recording: JumpRecording | null = null;
  let finished = false;
  let newRecord = false;
  let leftDown = false;
  let leftWasDown = false;

  const restart = () => {
    jump = startTrainingJump(hill, newSeed());
    inputs = [];
    c().resetHands();
    finished = false;
    newRecord = false;
    sounds.reset();
    c().announce("");
  };
  const finish = () => {
    finished = true;
    releaseMouse();
    const result = jumpResult(jump);
    // The record is the one from before this jump until onFinished stores the jump, so this repeats the verdict
    // given at touchdown.
    newRecord = beatsRecord(result, c().live.record);
    // A jump left while the jumper still slides out is kept as far as it went; the replay plays the rest with
    // no hands, after the result was settled.
    recording = { seed: jump.seed, inputs, newRecord };
    c().live.onFinished(result);
    c().onReplayAvailable(true);
    c().announce(resultAnnouncement(jump.state.logic, { newRecord, controls: c().live.controls }));
  };
  /** The input of the next simulation frame; the rules of the touch zones belong to finger steering. */
  const takeFrame = (logic: JumpLogicState) => {
    const zones = c().live.controls === "touch";
    input.setLeftTouchLeansOnly(zones && leftTouchLeansOnly(logic.phase));
    input.setRightTouchIsBothButtons(zones && rightTouchEndsPreparation(logic.phase));
    return input.takeFrame();
  };

  return {
    step(steps) {
      const stepped = stepJump(jump, { steps, leftHeld: input.left, record: c().live.record }, takeFrame);
      jump = stepped.jump;
      leftDown = stepped.leftDown;
      // The recording is owned here and handed out only once the jump is finished.
      if (!finished) inputs.push(...stepped.taken);
      playCues(stepped.cues, c(), true);
      if (stepped.touchdown) {
        newRecord = stepped.touchdown.newRecord;
        c().announce(touchdownAnnouncement(jump.state.logic, newRecord));
      }
    },
    settle() {
      const over = isJumpOver(jump);
      if (!finished && over) finish();
      // Once the notes are up (or a moment after a disqualification), a fresh press of the left button starts
      // the next jump; the jumper may still be sliding out, and the result is final by then, so it is recorded first.
      const clock = presentationFrame(jump);
      if (leftDown && !leftWasDown && nextJumpAllowed(jump.state.logic, clock)) {
        if (!finished) finish();
        restart();
      }
      leftWasDown = leftDown;
      return { over, clock };
    },
    restart,
    now: () => ({ jump, newRecord }),
    lastRecording: () => recording,
  };
}

interface ReplayRun extends JumpRun {
  /** Whether the replay has played to where a press starts a new jump. */
  ended: () => boolean;
}

/**
 * A recorded jump played again: the same simulation from the same seed and inputs, heard but not felt, and
 * not scored again.
 */
function createReplayRun(hill: HillChoice, source: ReplaySource, c: () => RunContext, sounds: JumpSounds): ReplayRun {
  const start = () => source.start(hill);
  let jump = start();
  let newRecord = false;
  const takeFrame = (logic: JumpLogicState) => source.input(logic);
  const restart = () => {
    jump = start();
    newRecord = false;
    sounds.reset();
    c().announce(UI_TEXT.announcement.replayStarted);
  };
  return {
    step(steps) {
      const stepped = stepJump(jump, { steps, leftHeld: false, record: undefined }, takeFrame);
      jump = stepped.jump;
      playCues(stepped.cues, c(), false);
      if (stepped.touchdown) {
        newRecord = source.newRecord;
        c().announce(touchdownAnnouncement(jump.state.logic, newRecord));
      }
    },
    settle: () => ({ over: isJumpOver(jump), clock: presentationFrame(jump) }),
    restart,
    now: () => ({ jump, newRecord }),
    ended: () => nextJumpAllowed(jump.state.logic, presentationFrame(jump)),
  };
}

/** What the screen can ask of the loop. */
export interface JumpLoopControls {
  /** Starts the jump again: a new training jump, or the replay from its start. */
  restart: () => void;
  /** Plays the last finished jump again. */
  watchReplay: () => void;
  /** Leaves the replay for a new training jump. */
  endReplay: () => void;
}

export const NO_CONTROLS: JumpLoopControls = {
  restart: () => undefined,
  watchReplay: () => undefined,
  endReplay: () => undefined,
};

interface RunSwitch {
  /** The run the frames go to: the replay while one plays, the training otherwise. */
  current: () => JumpRun;
  replaying: () => boolean;
  /** Plays a replay over the training, from its start. */
  play: (source: ReplaySource) => void;
  /** The name of the jumper of the replay being played, when it is not the player. */
  jumperName: () => string | null;
  controls: JumpLoopControls;
  /** A click or a touch of the picture in a replay: pause or go on, and once it is over, a new jump. */
  press: () => void;
}

/** The training on the hill, and a replay of its last finished jump laid over it while one is watched. */
export function createRunSwitch(
  hill: HillChoice,
  c: () => RunContext,
  sounds: JumpSounds,
  releaseMouse: () => void,
): RunSwitch {
  const training = createTrainingRun(hill, c, sounds, releaseMouse);
  let replay: ReplayRun | null = null;
  const current = (): JumpRun => replay ?? training;
  const endReplay = () => {
    if (!replay) return;
    replay = null;
    jumperName = null;
    training.restart();
    c().onReplayChange(null);
  };
  let jumperName: string | null = null;
  const play = (source: ReplaySource) => {
    releaseMouse();
    replay = createReplayRun(hill, source, c, sounds);
    jumperName = source.jumperName ?? null;
    replay.restart();
    c().onReplayChange(replayStart(source.origin));
  };
  const watchReplay = () => {
    const recording = training.lastRecording();
    if (recording) play(recordingSource(recording));
  };
  return {
    current,
    replaying: () => replay !== null,
    play,
    jumperName: () => jumperName,
    controls: {
      restart() {
        current().restart();
        // A replay started again plays, even if it was paused.
        const view = c().live.replay;
        if (replay && view?.paused === true) c().onReplayChange({ ...view, paused: false });
      },
      watchReplay,
      endReplay,
    },
    press() {
      const view = c().live.replay;
      if (replay?.ended() === true) {
        // After the player's own jump the next one follows; after a file of the original, the choices of the menu.
        if (view?.origin === "original") c().openMenu();
        else endReplay();
      } else if (view) c().onReplayChange({ ...view, paused: !view.paused });
    },
  };
}
