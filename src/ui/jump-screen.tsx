import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { planSteps } from "../game/fixed-step";
import { feedbackEvents, vibrate } from "../game/haptics";
import { pitchDeg, requestTiltPermission, tiltMotion } from "../game/tilt-input";
import type { HillChoice } from "../game/hill-choice";
import { PlayerInput } from "../game/player-input";
import { isJumpOver, newSeed, presentationFrame, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { notesShownBy } from "../sim/jump-logic";
import { FrameBuffer } from "../render/frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor, type ControlScheme } from "../render/jump-view";
import type { HillRecord, Settings } from "../storage/save-data";

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
}

const PLAYER_NAME = "GRACZ 1";
const MOUSE_LEFT = 0;
const MOUSE_RIGHT = 2;
/** From this device pixel ratio the view may scale by a fraction to fill the screen. */
const DENSE_SCREEN_DPR = 2;

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
  onPress: (down: boolean) => void;
  onDrag: (dy: number) => void;
}

/** A touch zone standing in for a mouse button; dragging in the left one leans like the mouse. */
function TouchPad({ side, onPress, onDrag }: TouchPadProps) {
  const lastY = useRef(new Map<number, number>());
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    lastY.current.delete(e.pointerId);
    if (lastY.current.size === 0) onPress(false);
  };
  return (
    <button
      type="button"
      className={`touch-pad touch-pad-${side}`}
      aria-label={side === "left" ? "Lewy przycisk; przesuwanie w pionie pochyla skoczka" : "Prawy przycisk"}
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
      <span className="touch-pad-hint">{side === "left" ? "przeciągnij: pochylenie" : "L+P: wybicie"}</span>
    </button>
  );
}

export function JumpScreen({ hill, record, settings, onSettings, onFinished, onExit }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(new PlayerInput());
  const restartRef = useRef<() => void>(() => undefined);
  const [announcement, setAnnouncement] = useState("");
  const touch = useMediaQuery("(pointer: coarse)");
  const [tiltOn, setTiltOn] = useState(false);
  const [tiltNote, setTiltNote] = useState("");
  /** In phone landscape the buttons sit behind a pause button; the jump stops while they are open. */
  const [menuOpen, setMenuOpen] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = menuOpen;
  }, [menuOpen]);
  /** Latest phone pitch and the neutral pitch captured at the start of the jump. */
  const tiltRef = useRef<{ on: boolean; pitch: number | null; neutral: number | null }>({ on: false, pitch: null, neutral: null });
  const controls: ControlScheme = touch ? (tiltOn ? "tilt" : "touch") : "mouse";
  const latest = useRef({ onExit, onFinished, record, settings, controls });
  useEffect(() => {
    latest.current = { onExit, onFinished, record, settings, controls };
  });
  const fullscreenAvailable = touch && document.fullscreenEnabled;

  // A saved choice of tilt steering is switched on again where the browser remembers the permission.
  const wantsTilt = settings.leanControl === "tilt";
  useEffect(() => {
    if (!touch || !wantsTilt) return undefined;
    let cancelled = false;
    void requestTiltPermission().then((granted) => {
      if (cancelled) return;
      tiltRef.current.on = granted;
      tiltRef.current.neutral = tiltRef.current.pitch;
      setTiltOn(granted);
      setTiltNote(granted ? "" : "Dotknij „Pochylanie”, aby włączyć przechył.");
    });
    return () => {
      cancelled = true;
    };
  }, [touch, wantsTilt]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;

    const input = inputRef.current;
    input.reset();
    let jump: TrainingJump = startTrainingJump(hill, newSeed());
    let view = makeView(viewWidthFor(stage.clientWidth, stage.clientHeight));
    let finished = false;
    let newRecord = false;
    let leftWasDown = false;
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const restart = () => {
      jump = startTrainingJump(hill, newSeed());
      input.reset();
      tiltRef.current.neutral = tiltRef.current.pitch;
      finished = false;
      newRecord = false;
      setAnnouncement("");
    };
    restartRef.current = restart;

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
      const L = jump.state.logic;
      const result: JumpResult = { distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 };
      const best = latest.current.record;
      const isRecord = !result.fell && result.distanceM > 0 && (!best || result.distanceM > best.distanceM);
      newRecord = isRecord;
      latest.current.onFinished(result);
      setAnnouncement(
        `Odległość ${result.distanceM.toFixed(2)} metra, ${result.points.toFixed(1)} punktu.${isRecord ? " Nowy rekord skoczni." : ""} Lewy przycisk lub R: jeszcze raz.`,
      );
    };

    const frame = (now: number) => {
      const plan = planSteps(acc, pausedRef.current ? 0 : (now - last) / 1000);
      last = now;
      acc = plan.accumulatorS;
      const tilt = tiltRef.current;
      for (let i = 0; i < plan.steps; i++) {
        if (tilt.on && tilt.pitch !== null) {
          tilt.neutral ??= tilt.pitch;
          input.addMotion(tiltMotion(tilt.pitch, tilt.neutral));
        }
        const prev = jump.state;
        stepTrainingJump(jump, input.takeFrame());
        if (latest.current.settings.vibration) {
          for (const event of feedbackEvents(prev, jump.state)) vibrate(event);
        }
      }
      const over = isJumpOver(jump);
      if (!finished && over) finish();
      // After the notes, a fresh press of the left button starts the next jump.
      const clock = presentationFrame(jump);
      if (over && input.left && !leftWasDown && notesShownBy(jump.state.logic, clock)) restart();
      leftWasDown = input.left;
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
        ...(best === undefined ? {} : { recordM: best.distanceM }),
      });
      ctx.putImageData(view.image, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      e.preventDefault();
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock().catch(() => undefined);
      if (e.button === MOUSE_LEFT) input.left = true;
      if (e.button === MOUSE_RIGHT) input.right = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (e.button === MOUSE_LEFT) input.left = false;
      if (e.button === MOUSE_RIGHT) input.right = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") input.addMotion(e.movementY);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case "KeyZ":
          input.left = down;
          break;
        case "KeyX":
          input.right = down;
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
          if (down && document.pointerLockElement !== canvas) latest.current.onExit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
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
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(raf);
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
          role="img"
          aria-label={`Skok na skoczni ${hill.name} K${hill.kPointM}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, przycisk tuż nad ziemią: telemark, po skoku lewy przycisk: jeszcze raz.`}
        />
      </div>
      <div className="game-toolbar">
        {menuOpen && (
          <button type="button" className="pixel-button resume-button" onClick={() => setMenuOpen(false)}>
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
                tiltRef.current.neutral = tiltRef.current.pitch;
                setTiltOn(granted);
                setTiltNote(granted ? "" : "Brak zgody na czujnik ruchu: pochylanie palcem.");
                if (granted) onSettings({ leanControl: "tilt" });
              });
            }}
          >
            {tiltOn ? "Pochylanie: przechył" : "Pochylanie: palec"}
          </button>
        )}
        {fullscreenAvailable && (
          <button
            type="button"
            className="pixel-button"
            onClick={() => {
              const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
              request.catch(() => undefined);
            }}
          >
            Pełny ekran
          </button>
        )}
        {touch && (
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
          onPress={(down) => {
            inputRef.current.left = down;
          }}
          onDrag={(dy) => inputRef.current.addMotion(dy)}
        />
      )}
      {touch && (
        <TouchPad
          side="right"
          onPress={(down) => {
            inputRef.current.right = down;
          }}
          onDrag={() => undefined}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
