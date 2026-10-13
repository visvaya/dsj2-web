import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { planSteps } from "../game/fixed-step";
import { canVibrate, feedbackEvents, vibrate } from "../game/haptics";
import { createSoundEngine, type SoundEngine } from "../audio/sound-engine";
import { notesAppearing, soundEvents, soundMix } from "../audio/sound-mix";
import { pickScenery } from "../game/scenery";
import { displayedWindMPerS } from "../game/wind-display";
import { TILT_AT_REST, pitchDeg, requestTiltPermission, tiltStep, type TiltState } from "../game/tilt-input";
import type { HillChoice } from "../game/hill-choice";
import { createPlayerInput, leftTouchLeansOnly, mouseButtons } from "../game/player-input";
import { lockLossAction, requestMouseCapture } from "../game/pointer-lock";
import {
  isJumpOver,
  newSeed,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  stepTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import { FrameBuffer } from "../render/frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor, type ControlScheme } from "../render/jump-view";
import type { HillRecord, SceneryChoice, Settings } from "../storage/save-data";
import { createHapticSwitch, hapticSwitchSupported } from "./haptic-switch";
import { useEntryFocus } from "./use-entry-focus";
import { JUMP_STARTED_ANNOUNCEMENT, resultAnnouncement, touchdownAnnouncement } from "./jump-announcement";

export interface JumpResult {
  distanceM: number;
  points: number;
  fell: boolean;
}

interface Props {
  hill: HillChoice;
  record: HillRecord | undefined;
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  onFinished: (result: JumpResult) => void;
  onExit: () => void;
  /** Whether the picture takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

const PLAYER_NAME = "GRACZ 1";
const NEXT_SCENERY: Readonly<Record<SceneryChoice, SceneryChoice>> = {
  varied: "day",
  day: "dusk",
  dusk: "night",
  night: "varied",
};
const SCENERY_LABEL: Readonly<Record<SceneryChoice, string>> = {
  varied: "zmienna",
  day: "dzień",
  dusk: "zmierzch",
  night: "noc",
};
/** From this device pixel ratio the view may scale by a fraction to fill the screen. */
const DENSE_SCREEN_DPR = 2;
/** How long a note about the motion sensor stays on screen. */
const TILT_NOTE_MS = 5000;

interface View {
  fb: FrameBuffer;
  image: ImageData;
}

function makeView(width: number): View {
  const fb = new FrameBuffer(width, VIEW_HEIGHT_PX);
  return { fb, image: new ImageData(fb.bytes, width, VIEW_HEIGHT_PX) };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

interface TouchPadProps {
  side: "left" | "right";
  /** Accessible name; it starts with the name of the button the zone stands for. */
  label: string;
  /** What the zone does, one line each, under its letter. */
  hints: readonly string[];
  /** Out of reach of the pointer and the keyboard while the pause controls cover the zone. */
  inert: boolean;
  onPress: (down: boolean) => void;
  onDrag: (dy: number) => void;
}

/**
 * A touch zone standing in for a mouse button; dragging in the left one leans like the mouse. In flight the
 * left zone only leans and the right one lands (`leftTouchLeansOnly`).
 */
function TouchPad({ side, label, hints, inert, onPress, onDrag }: TouchPadProps) {
  const lastY = useRef(new Map<number, number>());
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    lastY.current.delete(e.pointerId);
    if (lastY.current.size === 0) onPress(false);
  };
  return (
    <button
      type="button"
      className={`touch-pad touch-pad-${side}`}
      inert={inert}
      aria-label={label}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the press still counts.
        }
        lastY.current.set(e.pointerId, e.clientY);
        onPress(true);
      }}
      onPointerMove={(e) => {
        const prev = lastY.current.get(e.pointerId);
        if (prev === undefined) return;
        lastY.current.set(e.pointerId, e.clientY);
        onDrag(e.clientY - prev);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="touch-pad-key">{side === "left" ? "L" : "P"}</span>
      {hints.map((hint) => (
        <span key={hint} className="touch-pad-hint">
          {hint}
        </span>
      ))}
    </button>
  );
}

// oxlint-disable-next-line max-lines-per-function -- to be split: sound and tilt set-up, the jump loop, the controls markup
export function JumpScreen({ hill, record, settings, onSettings, onFinished, onExit, focusOnEntry }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEntryFocus(canvasRef, focusOnEntry);
  const inputRef = useRef(createPlayerInput());
  const restartRef = useRef<() => void>(() => undefined);
  const [announcement, setAnnouncement] = useState("");
  const touch = useMediaQuery("(pointer: coarse)");
  const [tiltOn, setTiltOn] = useState(false);
  const [tiltNote, setTiltNote] = useState("");
  // Notes about the motion sensor go away on their own.
  useEffect(() => {
    if (tiltNote === "") return undefined;
    const timer = setTimeout(() => setTiltNote(""), TILT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [tiltNote]);
  /** In phone landscape the buttons sit behind a pause button; the jump stops while they are open. */
  const [menuOpen, setMenuOpen] = useState(false);
  const pausedRef = useRef(false);
  const soundRef = useRef<SoundEngine | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpenRef = useRef(false);
  useEffect(() => {
    pausedRef.current = menuOpen;
    // The controls cover everything else, so the focus goes into them and returns to the pause button after.
    if (menuOpen) resumeButtonRef.current?.focus();
    else if (menuWasOpenRef.current) pauseButtonRef.current?.focus();
    menuWasOpenRef.current = menuOpen;
  }, [menuOpen]);
  /** Latest phone pitch, and where the phone was a frame ago (`tiltStep`). */
  const tiltRef = useRef<{ on: boolean; pitch: number | null; follow: TiltState }>({
    on: false,
    pitch: null,
    follow: TILT_AT_REST,
  });
  const controls: ControlScheme = touch ? (tiltOn ? "tilt" : "touch") : "mouse";
  // The look is drawn once per visit to the hill (not per jump), from its own seed.
  const [visitSeed] = useState(newSeed);
  const scenery = useMemo(() => pickScenery(settings.scenery, visitSeed), [settings.scenery, visitSeed]);
  const latest = useRef({ onExit, onFinished, record, settings, controls, scenery });
  useEffect(() => {
    latest.current = { onExit, onFinished, record, settings, controls, scenery };
  });
  const fullscreenAvailable = touch && document.fullscreenEnabled;
  // Offered where the phone can answer: with vibration, or in Safari on iOS with the tap of a system switch.
  const vibrationAvailable = touch && (canVibrate() || hapticSwitchSupported());

  // Sound: one engine per jump screen; it only listens to the game.
  useEffect(() => {
    const engine = createSoundEngine();
    soundRef.current = engine;
    const unlock = () => engine.unlock();
    // Browsers start audio only after a gesture. On iOS a touch counts when the finger lifts (touchend,
    // pointerup), not when it lands, so all of these are listened to.
    const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    for (const g of gestures) window.addEventListener(g, unlock, { capture: true });
    return () => {
      for (const g of gestures) window.removeEventListener(g, unlock, { capture: true });
      soundRef.current = null;
      engine.dispose();
    };
  }, []);
  const soundOn = settings.sound;
  useEffect(() => {
    soundRef.current?.setEnabled(soundOn);
  }, [soundOn]);

  // A saved choice of tilt steering is switched on again where the browser remembers the permission.
  const wantsTilt = settings.leanControl === "tilt";
  useEffect(() => {
    if (!touch || !wantsTilt) return undefined;
    let cancelled = false;
    void requestTiltPermission().then((granted) => {
      if (cancelled) return;
      tiltRef.current.on = granted;
      tiltRef.current.follow = TILT_AT_REST;
      setTiltOn(granted);
      setTiltNote(granted ? "" : "Dotknij „Pochylanie”, aby włączyć przechył.");
    });
    return () => {
      cancelled = true;
    };
  }, [touch, wantsTilt]);

  // oxlint-disable-next-line max-lines-per-function -- to be split: the frame loop, sounds, canvas fitting, pointer lock, input listeners
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;

    const input = inputRef.current;
    input.reset();
    // Only where the browser cannot vibrate: the stand-in for it, or nothing.
    const hapticSwitch = canVibrate() ? null : createHapticSwitch();
    let jump: TrainingJump = startTrainingJump(hill, newSeed());
    let view = makeView(viewWidthFor(stage.clientWidth, stage.clientHeight));
    let finished = false;
    let newRecord = false;
    let leftWasDown = false;
    let heardUpTo = 0;
    let recordPlayed = false;
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const restart = () => {
      jump = startTrainingJump(hill, newSeed());
      input.reset();
      tiltRef.current.follow = TILT_AT_REST;
      finished = false;
      newRecord = false;
      heardUpTo = 0;
      recordPlayed = false;
      setAnnouncement("");
    };
    restartRef.current = restart;

    // The mouse is captured during a jump and free between jumps, so the buttons below can be reached.
    let releasingLock = false;
    const releaseLock = () => {
      if (document.pointerLockElement !== canvas) return;
      releasingLock = true;
      document.exitPointerLock();
    };
    const onLockChange = () => {
      if (document.pointerLockElement === canvas) {
        releasingLock = false;
        return;
      }
      // A release that happened while the mouse was captured elsewhere never arrives.
      input.release("mouse");
      const loss = { releasedByGame: releasingLock, focused: document.hasFocus(), hidden: document.hidden };
      releasingLock = false;
      if (lockLossAction(loss) === "exit") latest.current.onExit();
    };
    document.addEventListener("pointerlockchange", onLockChange);

    const fit = () => {
      const width = viewWidthFor(stage.clientWidth, stage.clientHeight);
      if (width !== view.fb.width) view = makeView(width);
      canvas.width = width;
      canvas.height = VIEW_HEIGHT_PX;
      // Whole device pixels per game pixel keep every pixel the same size. On dense screens
      // (phones) a fractional scale fills the space; the uneven pixels are then below one device pixel.
      const dpr = window.devicePixelRatio || 1;
      const fill = Math.min((stage.clientWidth * dpr) / width, (stage.clientHeight * dpr) / VIEW_HEIGHT_PX);
      const scale = Math.max(1, dpr >= DENSE_SCREEN_DPR ? fill : Math.floor(fill));
      canvas.style.width = `${(width * scale) / dpr}px`;
      canvas.style.height = `${(VIEW_HEIGHT_PX * scale) / dpr}px`;
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(stage);

    const finish = () => {
      finished = true;
      releaseLock();
      const L = jump.state.logic;
      const result: JumpResult = { distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 };
      const best = latest.current.record;
      const isRecord = !result.fell && result.distanceM > 0 && (!best || result.distanceM > best.distanceM);
      newRecord = isRecord;
      latest.current.onFinished(result);
      setAnnouncement(resultAnnouncement(L, { newRecord: isRecord, touch: latest.current.controls !== "mouse" }));
    };

    /** Notes as they appear, the record jingle after the last one, and the continuous layers. */
    const playSounds = (clock: number) => {
      const engine = soundRef.current;
      if (!engine) return;
      const s = jump.state;
      for (const note of notesAppearing(s.logic, heardUpTo, clock))
        engine.play(note.counted ? "noteCounted" : "noteDropped");
      heardUpTo = clock;
      if (newRecord && !recordPlayed && notesShownBy(s.logic, clock)) {
        recordPlayed = true;
        engine.play("record");
      }
      const wind = displayedWindMPerS(s.wind);
      engine.update(
        soundMix({
          airborne: s.jumper.airborne,
          onTrack: s.logic.phase < PHASE.flightHold,
          groundSpeedMPerS: s.jumper.speedMPerS,
          airSpeedMPerS: Math.hypot(s.jumper.vxMPerS, s.jumper.vyMPerS),
          windMPerS: Math.hypot(wind.x, wind.y),
          paused: pausedRef.current || document.hidden,
        }),
      );
    };
    // A hidden tab stops animation frames, so the continuous sounds are hushed right away.
    const onVisibility = () => {
      if (document.hidden) {
        soundRef.current?.update(
          soundMix({
            airborne: false,
            onTrack: false,
            groundSpeedMPerS: 0,
            airSpeedMPerS: 0,
            windMPerS: 0,
            paused: true,
          }),
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const frame = (now: number) => {
      const plan = planSteps(acc, pausedRef.current ? 0 : (now - last) / 1000);
      last = now;
      acc = plan.accumulatorS;
      const tilt = tiltRef.current;
      if (tilt.on && tilt.pitch !== null) {
        // The phone is followed while the game is paused too, so what it did meanwhile does not arrive at once.
        const turned = tiltStep(tilt.follow, tilt.pitch);
        tilt.follow = turned.state;
        if (plan.steps > 0) input.addMotion(turned.motion);
      }
      // A click shorter than a frame is held only inside the frames taken below.
      let leftDown = input.left;
      for (let i = 0; i < plan.steps; i++) {
        const prev = jump.state;
        input.setLeftTouchLeansOnly(leftTouchLeansOnly(prev.logic.phase));
        const frameInput = input.takeFrame();
        leftDown ||= frameInput.left;
        jump = stepTrainingJump(jump, frameInput);
        for (const event of feedbackEvents(prev, jump.state)) {
          if (latest.current.settings.vibration) vibrate(event, navigator, hapticSwitch?.tap ?? null);
          soundRef.current?.play(event);
          if (event === "start") setAnnouncement(JUMP_STARTED_ANNOUNCEMENT);
        }
        // The jump is scored in the frame of the touchdown, seconds before the jumper stops.
        if (!prev.logic.finished && jump.state.logic.finished) setAnnouncement(touchdownAnnouncement(jump.state.logic));
        for (const event of soundEvents(prev, jump.state)) soundRef.current?.play(event);
      }
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
      playSounds(clock);
      const best = latest.current.record;
      drawJumpView(view.fb, {
        profile: hill.profile,
        kPointM: hill.kPointM,
        hillName: hill.name,
        playerName: PLAYER_NAME,
        state: jump.state,
        controls: latest.current.controls,
        frame: clock,
        over,
        newRecord,
        scenery: latest.current.scenery,
        outfit: latest.current.settings.outfit,
        windDriftM: jump.windDriftM,
        ...(best === undefined ? {} : { recordM: best.distanceM }),
      });
      ctx.putImageData(view.image, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      e.preventDefault();
      if (document.pointerLockElement !== canvas) requestMouseCapture(canvas);
      input.setButtons("mouse", mouseButtons(e.buttons));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") input.setButtons("mouse", mouseButtons(e.buttons));
    };
    // A second button pressed or released while one is held arrives as a move, so moves carry the buttons too.
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      input.setButtons("mouse", mouseButtons(e.buttons));
      input.addMotion(e.movementY);
    };
    // Key and button releases are lost while another window has the focus.
    const onBlur = () => {
      input.release("mouse");
      input.release("keys");
      input.setLeanKeys(0);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case "KeyZ":
          input.setButton("keys", "left", down);
          break;
        case "KeyX":
          input.setButton("keys", "right", down);
          break;
        case "ArrowUp":
          input.setLeanKeys(down ? -1 : 0);
          break;
        case "ArrowDown":
          input.setLeanKeys(down ? 1 : 0);
          break;
        case "KeyR":
          if (down) restart();
          break;
        case "Escape":
          // Not every browser keeps Escape to itself while the mouse is captured; where the key arrives, it
          // frees the mouse and leaves in one press. The browser's own handling of the key is left alone.
          if (down) {
            releaseLock();
            latest.current.onExit();
          }
          return;
        default:
          return;
      }
      e.preventDefault();
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- screen.orientation is missing in Safari before 16.4
      tiltRef.current.pitch = pitchDeg(e.beta, e.gamma, screen.orientation?.angle ?? 0);
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(raf);
      hapticSwitch?.remove();
      resize.disconnect();
      restartRef.current = () => undefined;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [hill]);

  return (
    <div className={`game${touch ? " touch" : ""}${menuOpen ? " menu-open" : ""}`}>
      {touch && (
        <button
          type="button"
          className="pause-button"
          aria-label="Pauza i ustawienia"
          aria-expanded={menuOpen}
          inert={menuOpen}
          ref={pauseButtonRef}
          onClick={() => setMenuOpen(true)}
        >
          <svg viewBox="0 0 6 6" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
            <rect x="0" y="0" width="2" height="6" fill="currentColor" />
            <rect x="4" y="0" width="2" height="6" fill="currentColor" />
          </svg>
        </button>
      )}
      <div className="game-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          role="img"
          aria-label={`Skok na skoczni ${hill.name} K${hill.kPointM}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, lewy lub prawy przycisk tuż nad ziemią: telemark, oba naraz: lądowanie na dwie nogi, po skoku lewy przycisk: jeszcze raz, Esc: lista skoczni.`}
        />
      </div>
      <div className="game-toolbar">
        {menuOpen && (
          <button
            type="button"
            className="pixel-button resume-button"
            ref={resumeButtonRef}
            onClick={() => setMenuOpen(false)}
          >
            Wróć do gry
          </button>
        )}
        <button
          type="button"
          className="pixel-button"
          onClick={() => {
            restartRef.current();
            setMenuOpen(false);
          }}
        >
          Jeszcze raz{touch ? "" : " (R)"}
        </button>
        <button type="button" className="pixel-button" onClick={onExit}>
          Skocznie{touch ? "" : " (Esc)"}
        </button>
        {touch && (
          <button
            type="button"
            className="pixel-button"
            aria-pressed={tiltOn}
            onClick={() => {
              if (tiltOn) {
                tiltRef.current.on = false;
                setTiltOn(false);
                setTiltNote("");
                onSettings({ leanControl: "drag" });
                return;
              }
              void requestTiltPermission().then((granted) => {
                tiltRef.current.on = granted;
                tiltRef.current.follow = TILT_AT_REST;
                setTiltOn(granted);
                setTiltNote(granted ? "" : "Brak zgody na czujnik ruchu: pochylanie palcem.");
                if (granted) onSettings({ leanControl: "tilt" });
              });
            }}
          >
            {tiltOn ? "Pochylanie: przechył" : "Pochylanie: palec"}
          </button>
        )}
        <button
          type="button"
          className="pixel-button"
          onClick={() => onSettings({ scenery: NEXT_SCENERY[settings.scenery] })}
        >
          Sceneria: {SCENERY_LABEL[settings.scenery]}
        </button>
        <button
          type="button"
          className="pixel-button"
          aria-pressed={settings.sound}
          onClick={() => onSettings({ sound: !settings.sound })}
        >
          {settings.sound ? "Dźwięk: wł." : "Dźwięk: wył."}
        </button>
        {fullscreenAvailable && (
          <button
            type="button"
            className="pixel-button"
            onClick={() => {
              const request = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              request.catch(() => undefined);
            }}
          >
            Pełny ekran
          </button>
        )}
        {vibrationAvailable && (
          <button
            type="button"
            className="pixel-button"
            aria-pressed={settings.vibration}
            onClick={() => onSettings({ vibration: !settings.vibration })}
          >
            {settings.vibration ? "Wibracje: wł." : "Wibracje: wył."}
          </button>
        )}
        {tiltNote !== "" && (
          <p className="note error" role="status">
            {tiltNote}
          </p>
        )}
      </div>
      {touch && (
        <TouchPad
          side="left"
          inert={menuOpen}
          onPress={(down) => inputRef.current.setButton("touch", "left", down)}
          hints={tiltOn ? ["przechyl telefon: pochylenie"] : ["przeciągnij: pochylenie"]}
          label={
            tiltOn
              ? "Lewy przycisk: start i wybicie"
              : "Lewy przycisk: start i wybicie; w locie przesuwanie w pionie pochyla skoczka"
          }
          onDrag={(dy) => {
            // With tilt steering the phone leans; a finger resting on the zone must not add to it.
            if (!tiltRef.current.on) inputRef.current.addMotion(dy);
          }}
        />
      )}
      {touch && (
        <TouchPad
          side="right"
          inert={menuOpen}
          hints={["L+P: wybicie", "P: telemark", "L+P w locie: dwie nogi"]}
          label="Prawy przycisk: wybicie razem z lewym; w locie telemark, a razem z lewym lądowanie na dwie nogi"
          onPress={(down) => inputRef.current.setButton("touch", "right", down)}
          onDrag={() => undefined}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
