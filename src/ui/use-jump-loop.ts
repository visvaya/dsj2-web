import { useEffect, useRef, type RefObject } from "react";
import type { SoundEngine } from "../audio/sound-engine";
import { planSteps } from "../game/fixed-step";
import { vibrate } from "../game/haptics";
import type { HillChoice } from "../game/hill-choice";
import { MARK_FIRST_JUMP_FRAME, markOnce } from "../game/performance-marks";
import { leftTouchLeansOnly, rightTouchEndsPreparation, type PlayerInput } from "../game/player-input";
import { mouseGain, sensitivityGain } from "../game/sensitivity";
import { tiltStep } from "../game/tilt-input";
import {
  isJumpOver,
  newSeed,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor, type ControlScheme, type Scenery } from "../render/jump-view";
import { beatsRecord, type HillRecord, type Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { JUMP_STARTED_ANNOUNCEMENT, resultAnnouncement, touchdownAnnouncement } from "./jump-announcement";
import { createJumpDiagnostics } from "./jump-diagnostics";
import { listenToPlayerInput, watchPointerLock } from "./jump-input-listeners";
import { makePicture, pictureSize, titleInsetFor, type JumpPicture } from "./jump-picture";
import { jumpResult, stepJump, type JumpCue, type JumpResult } from "./jump-round";
import { createJumpSounds, type JumpSounds } from "./jump-sounds";
import type { TiltReading } from "./use-steering";

/** What the loop reads anew in every frame: it outlives a render. */
interface LiveProps {
  onFinished: (result: JumpResult) => void;
  record: HillRecord | undefined;
  settings: Settings;
  controls: ControlScheme;
  scenery: Scenery;
}

interface JumpLoopOptions {
  hill: HillChoice;
  live: LiveProps;
  inputRef: RefObject<PlayerInput>;
  tiltRef: RefObject<TiltReading>;
  /** Lets go of everything held, for a jump that starts again. */
  resetHands: () => void;
  soundRef: RefObject<SoundEngine | null>;
  pausedRef: RefObject<boolean>;
  pauseButtonRef: RefObject<HTMLElement | null>;
  openMenu: () => void;
  toggleMenu: () => void;
  announce: (text: string) => void;
}

/** Feels and plays the moments of the jump, and tells a screen reader when the jumper leaves the gate. */
function playCues(cues: readonly JumpCue[], o: Pick<JumpLoopOptions, "live" | "soundRef" | "announce">): void {
  for (const cue of cues) {
    if (cue.kind === "feedback") {
      if (o.live.settings.vibration) vibrate(cue.event);
      o.soundRef.current?.play(cue.event);
      if (cue.event === "start") o.announce(JUMP_STARTED_ANNOUNCEMENT);
    } else {
      o.soundRef.current?.play(cue.event);
    }
  }
}

/** The jumps one after another: what a picture frame does to them, and what starts one again. */
interface TrainingRun {
  /** Steps the jump by `steps` simulation frames of the player's input, with the moments that come of it. */
  step: (steps: number) => void;
  /**
   * Reports a jump that is over, and starts the next one on a fresh press of the left button. Returns whether
   * the jump was over, and its presentation frame, as they were before a new jump started.
   */
  settle: () => { over: boolean; clock: number };
  restart: () => void;
  /** The jump, and whether it beats the record (known from the touchdown on). */
  now: () => { jump: TrainingJump; newRecord: boolean };
}

/**
 * The training jumps on a hill, from the player's input: a finished jump is reported once, and a fresh press of
 * the left button after it starts the next.
 */
function createTrainingRun(
  hill: HillChoice,
  o: () => JumpLoopOptions,
  sounds: JumpSounds,
  releaseMouse: () => void,
): TrainingRun {
  const input = o().inputRef.current;
  let jump: TrainingJump = startTrainingJump(hill, newSeed());
  let finished = false;
  let newRecord = false;
  let leftDown = false;
  let leftWasDown = false;

  const restart = () => {
    jump = startTrainingJump(hill, newSeed());
    o().resetHands();
    finished = false;
    newRecord = false;
    sounds.reset();
    o().announce("");
  };
  const finish = () => {
    finished = true;
    releaseMouse();
    const result = jumpResult(jump);
    // The record is the one from before this jump until onFinished stores the jump, so this repeats the verdict
    // given at touchdown.
    newRecord = beatsRecord(result, o().live.record);
    o().live.onFinished(result);
    o().announce(resultAnnouncement(jump.state.logic, { newRecord, controls: o().live.controls }));
  };
  /** The input of the next simulation frame; the rules of the touch zones belong to finger steering. */
  const takeFrame = (phase: number) => {
    const zones = o().live.controls === "touch";
    input.setLeftTouchLeansOnly(zones && leftTouchLeansOnly(phase));
    input.setRightTouchIsBothButtons(zones && rightTouchEndsPreparation(phase));
    return input.takeFrame();
  };

  return {
    step(steps) {
      const stepped = stepJump(jump, { steps, leftHeld: input.left, record: o().live.record }, takeFrame);
      jump = stepped.jump;
      leftDown = stepped.leftDown;
      playCues(stepped.cues, o());
      if (stepped.touchdown) {
        newRecord = stepped.touchdown.newRecord;
        o().announce(touchdownAnnouncement(jump.state.logic, newRecord));
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
  };
}

interface FrameView {
  jump: TrainingJump;
  newRecord: boolean;
  over: boolean;
  clock: number;
  titleInsetPx: number;
}

/** Draws a frame of the jump into the picture, as the player has the screen set up. */
function drawFrame(picture: JumpPicture, hill: HillChoice, live: LiveProps, v: FrameView): void {
  const best = live.record;
  drawJumpView(picture.fb, {
    profile: hill.profile,
    kPointM: hill.kPointM,
    hillName: hill.name,
    playerName: UI_TEXT.hud.playerName,
    state: v.jump.state,
    controls: live.controls,
    titleInsetPx: v.titleInsetPx,
    hints: live.settings.hillHints,
    frame: v.clock,
    over: v.over,
    newRecord: v.newRecord,
    scenery: live.scenery,
    outfit: live.settings.outfit,
    windDriftM: v.jump.windDriftM,
    ...(best === undefined ? {} : { recordM: best.distanceM }),
  });
}

/**
 * Runs the training jumps on the hill: steps the simulation at its fixed rate from the player's input, draws
 * each frame, plays the sounds and reports each finished jump. Returns the refs of the elements it draws into,
 * and what starts the jump again.
 */
export function useJumpLoop(options: JumpLoopOptions) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diagnosticsRef = useRef<HTMLPreElement>(null);
  const restartRef = useRef<() => void>(() => undefined);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { hill } = options;

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;
    const o = () => latest.current;
    const input = o().inputRef.current;
    input.reset();
    // The measurements exist only when asked for; without them the loop reads no clock of its own.
    const overlay = diagnosticsRef.current;
    const meter = overlay
      ? createJumpDiagnostics((text, stats) => {
          overlay.textContent = text;
          // The same numbers for whoever reads them from the page, under the names the statistics have.
          overlay.dataset["stats"] = JSON.stringify(stats);
        })
      : null;
    const sounds = createJumpSounds(() => o().soundRef.current);
    const lock = watchPointerLock(canvas, input, () => o().openMenu());
    const run = createTrainingRun(hill, o, sounds, lock.release);
    restartRef.current = run.restart;

    let picture = makePicture(viewWidthFor(stage.clientWidth, stage.clientHeight));
    /** How far the name of the hill starts from the left, when the pause button lies over that corner. */
    let titleInsetPx = 0;
    const fit = () => {
      const size = pictureSize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
      if (size.widthPx !== picture.fb.width) picture = makePicture(size.widthPx);
      canvas.width = size.widthPx;
      canvas.height = VIEW_HEIGHT_PX;
      canvas.style.width = `${size.cssWidthPx}px`;
      canvas.style.height = `${size.cssHeightPx}px`;
      titleInsetPx = titleInsetFor(canvas, o().pauseButtonRef.current, size.widthPx);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(stage);

    // A hidden tab stops animation frames, so the continuous sounds are hushed right away.
    const onVisibility = () => {
      meter?.discardNext();
      if (document.hidden) sounds.hush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let firstFrameMarked = false;
    const frame = (now: number) => {
      const { live, pausedRef, tiltRef } = o();
      const plan = planSteps(acc, pausedRef.current ? 0 : (now - last) / 1000);
      last = now;
      acc = plan.accumulatorS;
      const tilt = tiltRef.current;
      if (tilt.on && tilt.pitch !== null) {
        // The phone is followed while the game is paused too, so what it did meanwhile does not arrive at once.
        const turned = tiltStep(tilt.follow, tilt.pitch, sensitivityGain(live.settings.sensitivity.tilt));
        tilt.follow = turned.state;
        if (plan.steps > 0) input.addMotion(turned.motion);
      }
      meter?.stepsBegin();
      run.step(plan.steps);
      meter?.stepsEnd();
      const { over, clock } = run.settle();
      const { jump, newRecord } = run.now();
      sounds.play(jump.state, clock, newRecord, pausedRef.current || document.hidden);
      meter?.drawBegin();
      drawFrame(picture, hill, live, { jump, newRecord, over, clock, titleInsetPx });
      ctx.putImageData(picture.image, 0, 0);
      meter?.frameEnd(now, plan, pausedRef.current);
      if (!firstFrameMarked) {
        firstFrameMarked = true;
        markOnce(MARK_FIRST_JUMP_FRAME);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const stopInput = listenToPlayerInput(canvas, input, {
      paused: () => o().pausedRef.current,
      mouseGain: () => mouseGain(o().live.settings.sensitivity.mouse),
      restart: run.restart,
      escape: () => {
        lock.release();
        o().toggleMenu();
      },
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      resize.disconnect();
      restartRef.current = () => undefined;
      stopInput();
      lock.dispose();
    };
  }, [hill]);

  return { stageRef, canvasRef, diagnosticsRef, restartRef };
}
